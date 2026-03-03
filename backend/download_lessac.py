"""Pre-download lessac voice at build time. Run during Render deploy to avoid runtime download + memory spike.
Usage: python download_lessac.py
"""
import urllib.request
from pathlib import Path

VOICES_DIR = Path(__file__).resolve().parent / "voices"
HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
FILES = ["en_US-lessac-medium.onnx", "en_US-lessac-medium.onnx.json"]


def main():
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        dest = VOICES_DIR / f
        if dest.exists():
            print(f"  {f} already exists, skip")
            continue
        url = f"{HF_BASE}/{f}"
        print(f"  Downloading {url} -> {dest}")
        urllib.request.urlretrieve(url, str(dest))
    print("  Done. Lessac voice ready for runtime.")


if __name__ == "__main__":
    main()
