---
name: electron-reinstall
description: Build and reinstall the InkVoice Electron app in the current user's Applications directory without producing a DMG. Use only when the user explicitly asks to rebuild, reinstall, or relaunch the local InkVoice desktop app.
disable-model-invocation: true
---

# Reinstall InkVoice

Rebuild the Electron app as an unpacked macOS bundle, replace the per-user installation, and relaunch it.

1. Quit any running InkVoice process:

   ```bash
   pkill -f InkVoice
   ```

2. Build the application without a DMG:

   ```bash
   ./scripts/build-electron.sh --no-dmg
   ```

3. Replace the installed bundle:

   ```bash
   rm -rf ~/Applications/InkVoice.app
   cp -R dist/mac-arm64/InkVoice.app ~/Applications/
   ```

4. Relaunch InkVoice:

   ```bash
   open ~/Applications/InkVoice.app
   ```

Use `~/Applications/`, the per-user directory that does not require an administrator prompt. Stop and report the failing step if the build or copy fails.
