#!/usr/bin/env python3
"""
Colab-friendly Piper fine-tuning script.

What this script does:
1) Installs Piper training dependencies (optional)
2) Preprocesses your dataset (LJSpeech format)
3) Fine-tunes from a checkpoint (or trains from scratch if no checkpoint)
4) Exports ONNX and creates matching .onnx.json config

Dataset format expected:
  dataset_dir/
    metadata.csv  # lines: id|text
    wav/
      <id>.wav

Typical Colab usage:
  !python colab_piper_voice_train.py \
      --dataset-dir /content/dataset \
      --voice-name myvoice \
      --base-checkpoint-url "https://.../epoch=2164-step=1355540.ckpt"
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None) -> None:
    """Run command and fail fast on non-zero exit."""
    print("\n$", " ".join(cmd))
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def ensure_file(path: Path, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{label} not found: {path}")


def download(url: str, dst: Path) -> Path:
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading checkpoint:\n  {url}\n  -> {dst}")
    urllib.request.urlretrieve(url, str(dst))
    return dst


def latest_checkpoint(search_root: Path) -> Path:
    candidates = sorted(search_root.glob("**/checkpoints/*.ckpt"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise FileNotFoundError(f"No checkpoint found under: {search_root}")
    return candidates[0]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train/fine-tune Piper voice in Google Colab")
    p.add_argument("--dataset-dir", required=True, help="Path containing metadata.csv and wav/")
    p.add_argument("--voice-name", required=True, help="Voice slug, e.g. myvoice")
    p.add_argument("--language", default="en-us", help="espeak language, e.g. en-us")
    p.add_argument("--sample-rate", type=int, default=22050, choices=[16000, 22050], help="Model sample rate")
    p.add_argument("--quality", default="medium", choices=["low", "medium", "high"], help="Model quality")
    p.add_argument("--batch-size", type=int, default=16, help="Lower if out-of-memory")
    p.add_argument("--max-epochs", type=int, default=2000, help="Training epochs")
    p.add_argument("--max-phoneme-ids", type=int, default=400, help="Drop very long sentences")
    p.add_argument("--output-root", default="/content/piper_runs", help="Where outputs/checkpoints are stored")
    p.add_argument("--piper-root", default="/content/piper", help="Where Piper repo will be cloned")
    p.add_argument("--base-checkpoint", default="", help="Local .ckpt path to fine-tune from")
    p.add_argument("--base-checkpoint-url", default="", help="URL to .ckpt to download for fine-tuning")
    p.add_argument("--skip-install", action="store_true", help="Skip apt/pip install and build steps")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    dataset_dir = Path(args.dataset_dir).resolve()
    output_root = Path(args.output_root).resolve()
    piper_root = Path(args.piper_root).resolve()
    run_root = output_root / args.voice_name
    prep_dir = run_root / "prep"
    train_dir = run_root / "train"
    export_dir = run_root / "export"
    checkpoints_dir = run_root / "checkpoints"

    ensure_file(dataset_dir / "metadata.csv", "metadata.csv")
    if not (dataset_dir / "wav").exists():
        raise FileNotFoundError(f"wav directory not found: {dataset_dir / 'wav'}")

    if not args.skip_install:
        run(["apt-get", "update"])
        run(["apt-get", "install", "-y", "git", "espeak-ng", "python3-dev"])

        if not piper_root.exists():
            run(["git", "clone", "https://github.com/rhasspy/piper.git", str(piper_root)])
        else:
            print(f"Using existing Piper repo: {piper_root}")

        run([sys.executable, "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"])
        run([sys.executable, "-m", "pip", "install", "-e", str(piper_root / "src/python")])
        run(["bash", "build_monotonic_align.sh"], cwd=piper_root / "src/python")
    else:
        print("Skipping install/build steps as requested.")

    prep_dir.mkdir(parents=True, exist_ok=True)
    train_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)
    checkpoints_dir.mkdir(parents=True, exist_ok=True)

    run(
        [
            sys.executable,
            "-m",
            "piper_train.preprocess",
            "--language",
            args.language,
            "--input-dir",
            str(dataset_dir),
            "--output-dir",
            str(prep_dir),
            "--dataset-format",
            "ljspeech",
            "--single-speaker",
            "--sample-rate",
            str(args.sample_rate),
        ]
    )

    base_ckpt = Path(args.base_checkpoint).resolve() if args.base_checkpoint else None
    if args.base_checkpoint_url:
        ckpt_name = Path(args.base_checkpoint_url).name or "base.ckpt"
        base_ckpt = download(args.base_checkpoint_url, checkpoints_dir / ckpt_name)

    train_cmd = [
        sys.executable,
        "-m",
        "piper_train",
        "--dataset-dir",
        str(prep_dir),
        "--quality",
        args.quality,
        "--accelerator",
        "gpu",
        "--devices",
        "1",
        "--batch-size",
        str(args.batch_size),
        "--validation-split",
        "0.0",
        "--num-test-examples",
        "0",
        "--max_epochs",
        str(args.max_epochs),
        "--checkpoint-epochs",
        "1",
        "--precision",
        "32",
        "--max-phoneme-ids",
        str(args.max_phoneme_ids),
    ]

    if base_ckpt:
        ensure_file(base_ckpt, "base checkpoint")
        train_cmd.extend(["--resume_from_checkpoint", str(base_ckpt)])

    run(train_cmd, cwd=train_dir)

    ckpt = latest_checkpoint(train_dir)
    onnx_name = f"en_US-{args.voice_name}-{args.quality}.onnx"
    onnx_path = export_dir / onnx_name
    onnx_json_path = export_dir / f"{onnx_name}.json"

    run([sys.executable, "-m", "piper_train.export_onnx", str(ckpt), str(onnx_path)])
    shutil.copy2(prep_dir / "config.json", onnx_json_path)

    print("\nDone.")
    print(f"Checkpoint used for export: {ckpt}")
    print(f"ONNX model: {onnx_path}")
    print(f"ONNX config: {onnx_json_path}")
    print("\nCopy these into your ClearRead backend:")
    print(f"  backend/voices/{onnx_path.name}")
    print(f"  backend/voices/{onnx_json_path.name}")
    print("\nThen register the voice id in backend/main.py and frontend/src/lib/tts.js.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
