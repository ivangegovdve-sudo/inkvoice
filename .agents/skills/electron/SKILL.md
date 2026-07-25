---
name: electron
description: >-
  InkVoice Electron desktop build and runtime context. Use when working in electron/,
  scripts/build-*.sh, scripts/download-node.sh, scripts/after-pack.js, scripts/migrate.py,
  electron-builder.yml, packaging, DMGs, the loading screen, server startup, bundled data
  paths, or production-only desktop behavior. Also use when asked how the app is distributed,
  how to build it, or how production differs from dev. Trigger on keywords: electron, dmg,
  bundle, package, desktop, production build, standalone, afterPack, loading screen.
---

# InkVoice Electron Desktop App

## Production Runtime Flow

1. Electron shows `loading.html`, resolves user data at `~/Library/Application Support/InkVoice/`
2. First launch: creates dirs, copies bundled voices to user data
3. Runs SQLite migrations via bundled Python (`scripts/migrate.py` — uses stdlib sqlite3)
4. Picks 2 random ports, spawns Python TTS + Next.js standalone server (both on `127.0.0.1` — avoids macOS firewall prompts)
5. Polls `/health` (Python) and root (Next.js) every 2s
6. Ready → swaps window to the app. 5 min timeout → error screen with retry/quit.

**Dev:** `pnpm dev` + `pnpm electron:dev` in separate terminals. Dev server must be running first — Next.js is on `localhost:49813` (set by `pnpm dev:next` / `scripts/start.sh`). Note: `electron/main.ts` currently still hardcodes `localhost:3000` for `startDev`, which is a latent bug — `pnpm electron:dev` against the dev server loads an empty window until that's fixed.

## Key Decisions

| Decision            | Choice                                    | Why                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python bundling     | python-build-standalone (full runtime)    | PyInstaller + PyTorch + MPS is fragile. Full runtime is bigger but guaranteed to work.                                                                                                                   |
| Node.js for Next.js | Bundled standalone binary                 | Avoids Electron's ABI for native modules (better-sqlite3). Clean process separation.                                                                                                                     |
| Migration runner    | Python (stdlib sqlite3)                   | pnpm symlinks break portable `node_modules` for native addons. Python just works.                                                                                                                        |
| Code signing        | None (unsigned)                           | Downloaded app is quarantined → "is damaged" error. Users clear it with `xattr -dr com.apple.quarantine` (right-click → Open and Open Anyway do NOT work for this verdict). See README Download section. |
| Architecture        | arm64 only                                | All target users have Apple Silicon Macs.                                                                                                                                                                |
| Model weights       | Download on first launch                  | ~1.6GB OmniVoice model at `~/.cache/huggingface/` — shared with dev, not re-downloaded.                                                                                                                  |
| Data directory      | `~/Library/Application Support/InkVoice/` | Persists across uninstalls. Dev still uses `./data/`.                                                                                                                                                    |
| Distribution        | Share .dmg directly                       | No GitHub Releases, no auto-update.                                                                                                                                                                      |
| Voice updates       | First-launch copy only                    | Voices copied from bundle once. Future versions don't sync new voices.                                                                                                                                   |

## Build Pipeline

`pnpm electron:build` runs `scripts/build-electron.sh`:

1. **Download Node.js** — v22.22.0 arm64 → `dist-node/bin/node`
2. **Build Python** — python-build-standalone 3.11.11 + `api/requirements.txt` → `dist-python/`
3. **Build Next.js** — `prisma generate` + `pnpm build` + `rsync -aL` to `dist-nextjs/` (dereferences pnpm symlinks)
4. **Compile Electron** — tsup with `--external electron` → `dist-electron/`
5. **Package** — `electron-builder --mac --arm64` → `dist/InkVoice-1.0.0-arm64.dmg`

Steps 1-2 are cached. Delete `dist-python/` or `dist-node/` to force rebuild.

**Reinstall shortcut:** `pnpm electron:reinstall` — kills running app, copies fresh build into `~/Applications/`, relaunches. No admin prompt (per-user folder, unlike `/Applications/`).

## Gotchas

### pnpm Symlinks Break Portable Bundles

Next.js standalone preserves pnpm's symlink structure. `cp -R` preserves absolute symlinks (breaks on other machines), `cp -RL` fails on broken optional-dep symlinks. **Solution:** `rsync -aL --ignore-errors`.

After dereferencing, transitive dependencies remain nested inside `.pnpm/{pkg}/node_modules/` and can't be found by Node's resolution from the top-level copies. **Solution:** the build script runs a two-phase flattening step. Phase 1 hoists deps from top-level packages first (next, jsdom, epub2) so their dependency versions take priority. Phase 2 fills remaining gaps from all `.pnpm/` entries. This ordering matters — without it, the wrong version of a package can be hoisted (e.g., `whatwg-mimetype@5` breaks jsdom which needs `@4` because v5 changed `module.exports` from a constructor to a named export object).

Native modules using the `bindings` package (like better-sqlite3) still fail even after flattening because `bindings` searches relative to `__dirname`. This is why the migration runner uses Python instead of Node.

### electron-builder Strips node_modules from extraResources

Even with `filter: ["**/*"]`, electron-builder silently excludes `node_modules`. Workaround: `afterPack` hook in `scripts/after-pack.js` copies `dist-nextjs/node_modules` into the packaged app post-pack.

### No titleBarStyle: 'hiddenInset'

The Next.js app has no `-webkit-app-region: no-drag` CSS, so `hiddenInset` makes the window non-interactive (drag region eats all mouse events). Use the default title bar until the app adds explicit drag region CSS.

### tsup Must Mark electron as External

`--external electron` is required in the tsup build command. Without it, tsup bundles the `electron` npm shim (which resolves the binary path) into `main.js`. At runtime inside the packaged app, the shim fails with "Electron failed to install correctly" because there's no `node_modules/electron/` in the ASAR. The real `electron` module is provided by the Electron runtime itself — it must remain a `require('electron')` call.

### npmRebuild Must Be Disabled

`npmRebuild: false` in `electron-builder.yml`. Without it, `@electron/rebuild` tries to recompile better-sqlite3 against Electron 41's V8 headers and fails. Safe to disable because native modules run in the bundled system Node, not Electron.

### Python Server CWD

`python3.11 -m uvicorn api.app.main:app` requires cwd to be the **parent** of `api/` so Python module resolution finds `api.app.main`. In the bundle: cwd = `Resources/`.

### All Paths Via Environment Variables

The Electron main process passes `INKVOICE_*` env vars to both servers (`servers.ts` → `buildEnv`). Both Python (`api/app/config.py`) and Node.js (`src/lib/config/env.ts`) already read from these — no code changes needed. Key vars: `INKVOICE_BOOKS_DIR`, `INKVOICE_VOICES_DIR`, `INKVOICE_CACHE_DIR`, `INKVOICE_DB_PATH`, `INKVOICE_TTS_API_URL`, `INKVOICE_DEVICE`.

### ASAR Paths Must Match electron-builder Files

The `files` array in `electron-builder.yml` determines what goes into the ASAR archive. The path inside the ASAR matches the `files` entry — e.g., `electron/loading.html` in `files` means `app.getAppPath() + '/electron/loading.html'` at runtime, NOT `app.getAppPath() + '/loading.html'`. If paths don't match, you get a white/blank window with no error.

## Verifying a Build

After building, verify the packaged app without manual testing by running it from the terminal:

```bash
/path/to/InkVoice.app/Contents/MacOS/InkVoice 2>&1
```

Watch for:

- `[servers] Migrations complete.` — migration runner works
- `Next.js ... Ready in Xms` / `[servers] Next.js is ready.` — standalone server starts
- `OmniVoice model ready` / `[servers] Python TTS is ready.` — Python server starts
- `[main] App ready at http://...` — both servers healthy, app loaded
- Any `MODULE_NOT_FOUND` errors — missing hoisted dependency (re-run the flattening step)

This catches most issues (missing modules, broken paths, wrong cwd) without needing to click through the UI.

## Intentionally Deferred

- Windows build
- Auto-update (electron-updater + GitHub Releases)
- First-launch model download progress bar (currently indeterminate)
- Apple code signing + notarization
- Voice sync across app versions
