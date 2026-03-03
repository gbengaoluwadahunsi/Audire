"""
Piper TTS backend for ClearRead.
Run: python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

Voice models are auto-downloaded on first use into the voices/ subfolder.
You can also run:  python download_voices.py
"""
import asyncio
import gc
import io
import json
import logging
import os
import re
import time
import uuid
import wave
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

_BACKEND_DIR = Path(__file__).resolve().parent
_VOICES_DIR = _BACKEND_DIR / "voices"

VOICE_REGISTRY = {
    "amy":      {"model": "en_US-amy-medium.onnx",      "config": "en_US-amy-medium.onnx.json",      "name": "Amy"},
    "bryce":    {"model": "en_US-bryce-medium.onnx",     "config": "en_US-bryce-medium.onnx.json",    "name": "Bryce"},
    "danny":    {"model": "en_US-danny-low.onnx",        "config": "en_US-danny-low.onnx.json",       "name": "Danny"},
    "joe":      {"model": "en_US-joe-medium.onnx",       "config": "en_US-joe-medium.onnx.json",      "name": "Joe"},
    "kathleen": {"model": "en_US-kathleen-low.onnx",     "config": "en_US-kathleen-low.onnx.json",    "name": "Kathleen"},
    "kristin":  {"model": "en_US-kristin-medium.onnx",   "config": "en_US-kristin-medium.onnx.json",  "name": "Kristin"},
    "kusal":    {"model": "en_US-kusal-medium.onnx",     "config": "en_US-kusal-medium.onnx.json",    "name": "Kusal"},
    "lessac":   {"model": "en_US-lessac-medium.onnx",    "config": "en_US-lessac-medium.onnx.json",   "name": "Lessac"},
    "ljspeech": {"model": "en_US-ljspeech-high.onnx",   "config": "en_US-ljspeech-high.onnx.json",   "name": "LJSpeech"},
    "norman":   {"model": "en_US-norman-medium.onnx",    "config": "en_US-norman-medium.onnx.json",   "name": "Norman"},
    "ryan":     {"model": "en_US-ryan-medium.onnx",      "config": "en_US-ryan-medium.onnx.json",     "name": "Ryan"},
}

_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US"

_loaded_voices: dict = {}
_MAX_CACHED_VOICES = int(os.getenv("MAX_CACHED_VOICES", "1"))  # Limit memory on Render free tier (~60MB per voice)
_voice_access_order: list = []  # LRU: oldest first
# Only 1 TTS at a time to avoid memory spikes on 512MB Render free tier
_tts_semaphore = asyncio.Semaphore(1)
_logger = logging.getLogger("clearread.backend")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")


def _voice_dir(voice_id: str) -> str:
    """Return subfolder name for a voice on Hugging Face (e.g. amy/medium)."""
    info = VOICE_REGISTRY[voice_id]
    parts = info["model"].replace("en_US-", "").replace(".onnx", "").rsplit("-", 1)
    return f"{parts[0]}/{parts[1]}" if len(parts) == 2 else parts[0]


def _download_file(url: str, dest: Path):
    import urllib.request
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {url} -> {dest}")
    urllib.request.urlretrieve(url, str(dest))


def ensure_voice_files(voice_id: str):
    """Download voice model + config from Hugging Face if not present locally."""
    info = VOICE_REGISTRY[voice_id]
    model_path = _VOICES_DIR / info["model"]
    config_path = _VOICES_DIR / info["config"]
    if model_path.exists() and config_path.exists():
        return model_path, config_path
    vdir = _voice_dir(voice_id)
    model_url = f"{_HF_BASE}/{vdir}/{info['model']}"
    config_url = f"{_HF_BASE}/{vdir}/{info['config']}"
    _download_file(model_url, model_path)
    _download_file(config_url, config_path)
    return model_path, config_path


def get_voice(voice_id: str):
    """Load (or return cached) PiperVoice instance. LRU evicts when over MAX_CACHED_VOICES."""
    global _voice_access_order
    if voice_id not in VOICE_REGISTRY:
        voice_id = "lessac"
    if voice_id in _loaded_voices:
        _voice_access_order = [v for v in _voice_access_order if v != voice_id] + [voice_id]
        return _loaded_voices[voice_id]
    # Evict LRU if at capacity (each model ~60MB; Render free tier = 512MB)
    while len(_loaded_voices) >= _MAX_CACHED_VOICES and _voice_access_order:
        evict_id = _voice_access_order.pop(0)
        if evict_id in _loaded_voices:
            del _loaded_voices[evict_id]
            _logger.info("voice_evicted voice=%s cached=%s", evict_id, list(_loaded_voices.keys()))
    model_path, config_path = ensure_voice_files(voice_id)
    from piper import PiperVoice
    voice = PiperVoice.load(str(model_path), config_path=str(config_path), use_cuda=False)
    _loaded_voices[voice_id] = voice
    _voice_access_order.append(voice_id)
    return voice


def synthesize_to_wav(text: str, voice_id: str = "lessac", speed: float = 1.0) -> bytes:
    """Synthesize text and return WAV bytes."""
    voice = get_voice(voice_id)
    from piper.config import SynthesisConfig

    syn_config = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, speed)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        voice.synthesize_wav(text, wf, syn_config=syn_config, set_wav_format=True)
    return buf.getvalue()


def synthesize_with_retry(text: str, voice_id: str, speed: float, attempts: int = 2) -> bytes:
    """Best-effort retry for transient synthesis/model issues."""
    last_error = None
    for i in range(attempts):
        try:
            return synthesize_to_wav(text, voice_id=voice_id, speed=speed)
        except Exception as e:  # noqa: BLE001
            last_error = e
            _logger.warning("tts_synthesize_attempt_failed attempt=%s voice=%s err=%s", i + 1, voice_id, str(e))
    raise last_error


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _loaded_voices.clear()
    _voice_access_order.clear()


app = FastAPI(title="ClearRead TTS", lifespan=lifespan)

# CORS: default "*" allows all origins. Set ALLOWED_ORIGINS to restrict (comma-separated).
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
_allowed_origins = ["*"] if _allowed_origins_env == "*" else [x.strip() for x in _allowed_origins_env.split(",") if x.strip()] or ["*"]

# CORS must be added first so it runs last (outermost) and handles OPTIONS preflight
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False if _allowed_origins == ["*"] else True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as e:  # noqa: BLE001
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        _logger.exception(
            "request_failed request_id=%s method=%s path=%s ms=%s err=%s",
            request_id,
            request.method,
            request.url.path,
            elapsed_ms,
            str(e),
        )
        raise
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    response.headers["x-request-id"] = request_id
    _logger.info(
        "request_done request_id=%s method=%s path=%s status=%s ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


class TTSRequest(BaseModel):
    text: str
    voice: str = "lessac"
    speed: float = 1.0


class TTSStreamRequest(BaseModel):
    text: str
    voice: str = "lessac"
    speed: float = 1.0
    max_chunk_chars: int = 600
    chunks: list[str] | None = None


def validate_text_payload(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="text is required")
    if len(cleaned) > 20000:
        raise HTTPException(status_code=413, detail="text too long (max 20000 chars)")
    return cleaned


def split_text_for_tts(text: str, max_chunk_chars: int = 600) -> list[str]:
    clean = (text or "").strip()
    if not clean:
        return []
    parts = re.split(r"(?<=[.!?])\s+", clean)
    chunks: list[str] = []
    current = ""
    for part in parts:
        seg = part.strip()
        if not seg:
            continue
        candidate = f"{current} {seg}".strip() if current else seg
        if current and len(candidate) > max_chunk_chars:
            chunks.append(current)
            current = seg
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _run_synthesize(text: str, voice_id: str, speed: float) -> bytes:
    """Blocking synthesis; run in executor. Caller holds semaphore."""
    result = synthesize_with_retry(text, voice_id, speed)
    gc.collect()
    return result


@app.post("/api/tts")
async def synthesize_endpoint(request: TTSRequest):
    """Synthesize speech from text. Returns WAV audio bytes."""
    text = validate_text_payload(request.text)
    voice_id = request.voice if request.voice in VOICE_REGISTRY else "lessac"
    try:
        async with _tts_semaphore:
            loop = asyncio.get_event_loop()
            wav_bytes = await loop.run_in_executor(None, _run_synthesize, text, voice_id, request.speed)
        return Response(content=wav_bytes, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        _logger.exception("tts_endpoint_failed voice=%s err=%s", voice_id, str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts/stream")
async def synthesize_stream(request: TTSStreamRequest):
    """Stream NDJSON events with base64 WAV chunks as they are generated."""
    import base64
    _ = validate_text_payload(request.text)
    voice_id = request.voice if request.voice in VOICE_REGISTRY else "lessac"
    speed = max(0.5, min(2.0, float(request.speed)))
    max_chunk_chars = max(120, min(2000, int(request.max_chunk_chars or 600)))
    if request.chunks:
        chunks = [c.strip() for c in request.chunks if c and c.strip()]
    else:
        chunks = split_text_for_tts(request.text, max_chunk_chars=max_chunk_chars)

    async def event_stream():
        async with _tts_semaphore:
            try:
                loop = asyncio.get_event_loop()
                for i, chunk_text in enumerate(chunks):
                    wav_bytes = await loop.run_in_executor(None, _run_synthesize, chunk_text, voice_id, speed)
                    payload = {
                        "type": "chunk",
                        "index": i,
                        "audio_b64": base64.b64encode(wav_bytes).decode("ascii"),
                    }
                    yield (json.dumps(payload) + "\n").encode("utf-8")
                yield b'{"type":"done"}\n'
            except Exception as e:  # noqa: BLE001
                _logger.exception("tts_stream_failed voice=%s err=%s", voice_id, str(e))
                yield (json.dumps({"type": "error", "detail": str(e)}) + "\n").encode("utf-8")

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@app.get("/")
async def root():
    """Root route for Render health checks and visitors. API docs at /docs."""
    return {"service": "ClearRead TTS", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "backend": "piper",
        "loaded_voices": sorted(list(_loaded_voices.keys())),
        "available_voices": len(VOICE_REGISTRY),
    }


@app.get("/api/tts/voices")
async def voices():
    """Return list of supported voice ids."""
    return [{"id": k, "name": v["name"]} for k, v in VOICE_REGISTRY.items()]
