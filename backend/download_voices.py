"""Download default Piper voice models for ClearRead.
Run:  python download_voices.py
Downloads into the voices/ subfolder next to this script.
"""
from main import VOICE_REGISTRY, ensure_voice_files

DEFAULT_VOICES = ["lessac", "amy", "ryan", "joe", "kristin", "ljspeech"]

if __name__ == "__main__":
    print("Downloading Piper voice models...\n")
    for vid in DEFAULT_VOICES:
        if vid not in VOICE_REGISTRY:
            continue
        print(f"[{vid}] {VOICE_REGISTRY[vid]['name']}")
        try:
            ensure_voice_files(vid)
            print(f"  OK\n")
        except Exception as e:
            print(f"  FAILED: {e}\n")
    print("Done. You can start the server now:")
    print("  python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000")
