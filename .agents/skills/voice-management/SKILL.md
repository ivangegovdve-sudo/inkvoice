---
name: voice-management
description: Manage TTS voice references for OmniVoice. Use when adding voices, generating voice samples, or working with data/voices/ directory.
disable-model-invocation: true
---

# Voice Management

## Directory Structure

```
data/voices/{voice-name}/
  source.wav   # Reference audio for TTS cloning (required)
  source.txt   # Whisper transcript of source.wav (required by OmniVoice)
  sample.wav   # TTS-generated preview clip (optional)
```

## Add a Voice

Full workflow for adding a new voice:

1. **Copy the source file** into the voices directory:

   ```bash
   mkdir -p data/voices/{voice-name}
   cp /path/to/audio.wav data/voices/{voice-name}/source.wav
   ```

2. **Validate duration** — must be at least 10 seconds:

   ```bash
   ffprobe -v error -show_entries format=duration -of csv=p=0 data/voices/{voice-name}/source.wav
   ```

3. **Add a transcript** — create `source.txt` with the Whisper transcript of `source.wav`:

   ```bash
   echo "The exact words spoken in source.wav" > data/voices/{voice-name}/source.txt
   ```

4. **Generate sample** (dev server must be **stopped**):

   ```bash
   bash .agents/skills/voice-management/scripts/generate-samples.sh {voice-name}
   ```

   > **Warning:** Do NOT generate samples while the dev server is running — concurrent requests cause voice embedding contamination on the shared model singleton.

5. **Check TTS server logs** — no warnings should appear when using the voice later

## Scripts

### `scripts/generate-samples.sh`

Generates TTS voice samples by loading OmniVoice directly (no HTTP server). Runs sequentially to avoid the concurrency race condition in the shared model singleton.

```
generate-samples.sh <voice-name>          # generate sample for one voice
generate-samples.sh --all                  # generate for all voices (skip existing)
generate-samples.sh --force <voice-name>   # regenerate even if sample.wav exists
generate-samples.sh --force --all          # regenerate all
```

**Important:** Stop the dev server before running. The script checks port 8000 and refuses to run if it's in use.

Sample text is chosen by gender tag in `metadata.json`:

- **Male** voices: the Night's Watch oath
- **Female** voices: Daenerys Targaryen speech

Falls back to male text if no metadata or no `"female"` tag.

**After regenerating samples**, bump the `?v=` query param in `src/app/settings/components/VoiceManagerCard/hooks/useVoicePreview/useVoicePreview.ts` — the sample API returns `Cache-Control: immutable`, so browsers won't refetch without a new URL.

## Requirements

- `source.wav` must be at least **10 seconds** long
- `source.txt` must exist alongside `source.wav` with the Whisper transcript
- After adding a voice, verify no warnings in TTS server logs
