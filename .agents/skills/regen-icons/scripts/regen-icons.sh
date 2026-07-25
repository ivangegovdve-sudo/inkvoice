#!/usr/bin/env bash
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
# Use the most recently modified SVG in design/logo/versions/
SOURCE_SVG="$(ls -t "$REPO_ROOT/design/logo/versions/"*.svg 2>/dev/null | head -1)"

PUBLIC_ICONS="$REPO_ROOT/public/icons"
ICONSET="$REPO_ROOT/build/icon.iconset"
BUILD="$REPO_ROOT/build"
APP="$REPO_ROOT/src/app"

# ── Preflight ───────────────────────────────────────────────────────
for cmd in rsvg-convert magick iconutil; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found. Install with:"
    case "$cmd" in
      rsvg-convert) echo "  brew install librsvg" ;;
      magick)       echo "  brew install imagemagick" ;;
      iconutil)     echo "  (macOS built-in — should already exist)" ;;
    esac
    exit 1
  fi
done

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "ERROR: Source SVG not found at $SOURCE_SVG"
  exit 1
fi

echo "Source: $SOURCE_SVG"
echo ""

# ── public/icons/ PNGs ──────────────────────────────────────────────
mkdir -p "$PUBLIC_ICONS"
echo "Generating public/icons/ PNGs..."
for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" "$SOURCE_SVG" -o "$PUBLIC_ICONS/icon-${size}.png"
  echo "  icon-${size}.png"
done

# ── build/icon.iconset/ (macOS requires specific filenames) ─────────
mkdir -p "$ICONSET"
echo ""
echo "Generating build/icon.iconset/..."

# name:pixels pairs — standard + @2x variants
ICONSET_ENTRIES="
icon_16x16:16
icon_16x16@2x:32
icon_32x32:32
icon_32x32@2x:64
icon_128x128:128
icon_128x128@2x:256
icon_256x256:256
icon_256x256@2x:512
icon_512x512:512
icon_512x512@2x:1024
"

for entry in $ICONSET_ENTRIES; do
  name="${entry%%:*}"
  size="${entry##*:}"
  content=$(( size * 80 / 100 ))
  rsvg-convert -w "$content" -h "$content" "$SOURCE_SVG" -o "$ICONSET/${name}.png"
  magick "$ICONSET/${name}.png" \
    -gravity center -background none -extent "${size}x${size}" \
    -define png:color-type=6 \
    "$ICONSET/${name}.png"
  echo "  ${name}.png (${size}x${size})"
done

# ── build/icon.icns ─────────────────────────────────────────────────
echo ""
echo "Generating build/icon.icns..."
iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"
echo "  icon.icns"

# ── src/app/icon.png (Next.js, 512px) ──────────────────────────────
echo ""
echo "Generating src/app/icon.png..."
cp "$PUBLIC_ICONS/icon-512.png" "$APP/icon.png"
echo "  icon.png"

# ── src/app/apple-icon.png (180px) ─────────────────────────────────
echo ""
echo "Generating src/app/apple-icon.png..."
rsvg-convert -w 180 -h 180 "$SOURCE_SVG" -o "$APP/apple-icon.png"
echo "  apple-icon.png"

# ── src/app/favicon.ico (multi-size) ───────────────────────────────
echo ""
echo "Generating src/app/favicon.ico..."
magick "$PUBLIC_ICONS/icon-16.png" \
       "$PUBLIC_ICONS/icon-32.png" \
       "$PUBLIC_ICONS/icon-64.png" \
       "$PUBLIC_ICONS/icon-128.png" \
       "$PUBLIC_ICONS/icon-256.png" \
       "$APP/favicon.ico"
echo "  favicon.ico"

echo ""
echo "Done! All icons regenerated from source SVG."
