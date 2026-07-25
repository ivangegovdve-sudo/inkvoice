#!/usr/bin/env bash
# Generate TTS voice samples using OmniVoice directly (no HTTP server).
#
# WARNING: Do NOT run this while the dev server is running — the shared model
# singleton causes voice embedding contamination with concurrent requests.
#
# Usage:
#   generate-samples.sh <voice-name>   — generate sample for one voice
#   generate-samples.sh --all          — generate samples for all voices
#   generate-samples.sh --force --all  — regenerate even if sample.wav exists

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
VENV_PYTHON="$PROJECT_DIR/venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Error: venv not found at $PROJECT_DIR/venv/" >&2
  echo "Run: python -m venv venv && pip install -r requirements.txt" >&2
  exit 1
fi

# Check if dev server is running on port 8000
if lsof -i :8000 >/dev/null 2>&1; then
  echo "Error: Port 8000 is in use — stop the dev server before generating samples." >&2
  echo "Concurrent TTS requests cause voice embedding contamination." >&2
  exit 1
fi

FORCE=0
TARGET=""
ALL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --all) ALL=1 ;;
    *) TARGET="$arg" ;;
  esac
done

if [ "$ALL" -eq 0 ] && [ -z "$TARGET" ]; then
  echo "Usage: generate-samples.sh [--force] <voice-name>" >&2
  echo "       generate-samples.sh [--force] --all" >&2
  exit 1
fi

"$VENV_PYTHON" - "$PROJECT_DIR" "$FORCE" "$ALL" "$TARGET" << 'PYTHON_SCRIPT'
import sys
import io
import json
from pathlib import Path

project_dir = Path(sys.argv[1])
force = sys.argv[2] == "1"
all_voices = sys.argv[3] == "1"
target = sys.argv[4]

voices_dir = project_dir / "data" / "voices"

MALE_TEXT = (
    "Night gathers, and now my watch begins. It shall not end until my death. "
    "I shall take no wife, hold no lands, father no children. "
    "I shall wear no crowns and win no glory. I shall live and die at my post. "
    "I am the sword in the darkness. I am the watcher on the walls. "
    "I am the fire that burns against the cold, the light that brings the dawn, "
    "the horn that wakes the sleepers, the shield that guards the realms of men. "
    "I pledge my life and honor to the Night's Watch, for this night and all the nights to come."
)

FEMALE_TEXT = (
    "I am Daenerys Stormborn of House Targaryen, of the blood of Old Valyria. "
    "I am the dragon's daughter, and I swear to you that those who would harm you "
    "will die screaming. I will take what is mine with fire and blood. "
    "I will not look back. I am a queen, and I choose to walk into the fire. "
    "For the night is dark and full of terrors, but the fire of my people burns "
    "brighter still. We do not kneel, and we do not break. We are the unburnt, "
    "and we will light the way."
)


def get_sample_text(voice_dir):
    """Read metadata.json tags to pick male or female sample text."""
    meta_path = voice_dir / "metadata.json"
    if meta_path.exists():
        try:
            tags = json.loads(meta_path.read_text()).get("tags", [])
            if "female" in tags:
                return FEMALE_TEXT
        except (json.JSONDecodeError, KeyError):
            pass
    return MALE_TEXT


# Collect voice directories to process
voice_dirs = []
if all_voices:
    for d in sorted(voices_dir.iterdir()):
        if d.name == "custom":
            for cd in sorted(d.iterdir()):
                if (cd / "source.wav").exists():
                    voice_dirs.append(cd)
        elif (d / "source.wav").exists():
            voice_dirs.append(d)
else:
    # Check both top-level and custom
    candidate = voices_dir / target
    if (candidate / "source.wav").exists():
        voice_dirs.append(candidate)
    else:
        candidate = voices_dir / "custom" / target
        if (candidate / "source.wav").exists():
            voice_dirs.append(candidate)
        else:
            print(f"Error: Voice '{target}' not found", file=sys.stderr)
            sys.exit(1)

# Filter out voices that already have samples (unless --force)
if not force:
    before = len(voice_dirs)
    voice_dirs = [d for d in voice_dirs if not (d / "sample.wav").exists()]
    skipped = before - len(voice_dirs)
    if skipped:
        print(f"Skipping {skipped} voice(s) with existing samples (use --force to regenerate)")

if not voice_dirs:
    print("Nothing to generate.")
    sys.exit(0)

# Load model once
import torch
import torchaudio
from omnivoice import OmniVoice

print("Loading OmniVoice model...")
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="mps", dtype=torch.float32)
print(f"Model loaded. Generating {len(voice_dirs)} sample(s)...\n")

SAMPLE_RATE = 24000

for i, vdir in enumerate(voice_dirs, 1):
    voice_name = vdir.relative_to(voices_dir)
    source_path = vdir / "source.wav"
    source_txt_path = vdir / "source.txt"
    sample_path = vdir / "sample.wav"

    ref_text = ""
    if source_txt_path.exists():
        ref_text = source_txt_path.read_text().strip()

    text = get_sample_text(vdir)
    label = "female" if text is FEMALE_TEXT else "male"
    print(f"[{i}/{len(voice_dirs)}] {voice_name} ({label})...", end=" ", flush=True)

    with torch.inference_mode():
        wav = model.generate(text=text, ref_audio=str(source_path), ref_text=ref_text)

    torchaudio.save(str(sample_path), wav, SAMPLE_RATE, format="wav")
    print("done")

print(f"\nGenerated {len(voice_dirs)} sample(s).")
PYTHON_SCRIPT
