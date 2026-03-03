import json

from fastapi.testclient import TestClient

import main


def test_health_ok():
    client = TestClient(main.app)
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["backend"] == "piper"


def test_voices_endpoint():
    client = TestClient(main.app)
    r = client.get("/api/tts/voices")
    assert r.status_code == 200
    data = r.json()
    assert any(v["id"] == "lessac" for v in data)


def test_tts_requires_text():
    client = TestClient(main.app)
    r = client.post("/api/tts", json={"text": "   "})
    assert r.status_code == 400


def test_tts_returns_wav(monkeypatch):
    client = TestClient(main.app)

    def fake_synth(text, voice_id, speed, attempts=2):
        _ = (text, voice_id, speed, attempts)
        return b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 24

    monkeypatch.setattr(main, "synthesize_with_retry", fake_synth)
    r = client.post("/api/tts", json={"text": "Hello world", "voice": "lessac", "speed": 1.0})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/wav")


def test_tts_stream_ndjson(monkeypatch):
    client = TestClient(main.app)

    def fake_synth(text, voice_id, speed, attempts=2):
        _ = (text, voice_id, speed, attempts)
        return b"fakewav"

    monkeypatch.setattr(main, "synthesize_with_retry", fake_synth)
    r = client.post("/api/tts/stream", json={"text": "stream", "chunks": ["One.", "Two."]})
    assert r.status_code == 200
    lines = [ln for ln in r.text.splitlines() if ln.strip()]
    payloads = [json.loads(ln) for ln in lines]
    assert any(p.get("type") == "chunk" for p in payloads)
    assert payloads[-1]["type"] == "done"
