---
name: regen-icons
description: Regenerate all app icons (PNGs, .icns, favicon, apple-icon) from the source SVG. Use after updating the logo SVG in design/logo/versions/. Trigger on "regenerate icons", "update icons", "regen icons", "rebuild icons", "icon assets".
disable-model-invocation: true
---

# Regenerate Icons

Converts the source logo SVG into all derived icon assets used by Next.js and Electron.

## Source SVG Requirements

The script picks the most recently modified `.svg` in `design/logo/versions/`.

The SVG **must have rounded corners baked in** — macOS does not auto-apply the squircle mask for Electron apps. Use `rx` on the background `<rect>` at ~20% of the viewBox size (e.g., `rx="405"` on a 2048 viewBox, `rx="16"` on an 80 viewBox).

The script adds padding for macOS iconset PNGs (80% content, centered) but does not add rounding.

## Generated Assets

| Asset            | Path                               | Padding               |
| ---------------- | ---------------------------------- | --------------------- |
| Electron PNGs    | `public/icons/icon-{16..1024}.png` | None (full-bleed)     |
| macOS iconset    | `build/icon.iconset/icon_*.png`    | 80% content, centered |
| macOS app icon   | `build/icon.icns`                  | 80% content, centered |
| Next.js app icon | `src/app/icon.png`                 | None (full-bleed)     |
| Apple touch icon | `src/app/apple-icon.png`           | None (full-bleed)     |
| Favicon          | `src/app/favicon.ico`              | None (full-bleed)     |

## Usage

```bash
bash .agents/skills/regen-icons/scripts/regen-icons.sh
```
