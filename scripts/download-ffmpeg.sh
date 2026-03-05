#!/usr/bin/env bash
# download-ffmpeg.sh
# Downloads static ffmpeg and ffprobe binaries for macOS (Intel + Apple Silicon).
# Run this once before building:  bash scripts/download-ffmpeg.sh
#
# Sources:
#   macOS arm64/x86_64: https://evermeet.cx/ffmpeg/  (static builds, GPL)
#   See also: https://www.johnvansickle.com/ffmpeg/   (Linux)
#
# License note: ffmpeg is licensed under LGPL 2.1 / GPL 2.0+.
# By bundling it you accept its license terms. See docs/FFMPEG_LICENSE.md.

set -euo pipefail

DEST="$(dirname "$0")/../src-tauri/bin"
mkdir -p "$DEST"

# ─── Detect host arch ─────────────────────────────────────────────────────────
ARCH=$(uname -m)  # arm64 or x86_64

if [[ "$ARCH" == "arm64" ]]; then
  TARGET="aarch64-apple-darwin"
else
  TARGET="x86_64-apple-darwin"
fi

echo "→ Downloading ffmpeg and ffprobe for macOS ($TARGET)…"

# ─── ffmpeg ───────────────────────────────────────────────────────────────────
# evermeet.cx provides the latest static build as a .7z archive.
# We download, extract, and rename with the Tauri sidecar suffix.

FFMPEG_URL="https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
FFPROBE_URL="https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "  Downloading ffmpeg…"
curl -L -o "$TMP/ffmpeg.zip" "$FFMPEG_URL"
unzip -q -o "$TMP/ffmpeg.zip" -d "$TMP/ffmpeg_out"
# The zip contains a single binary named 'ffmpeg'
cp "$TMP/ffmpeg_out/ffmpeg" "$DEST/ffmpeg-$TARGET"
chmod +x "$DEST/ffmpeg-$TARGET"

echo "  Downloading ffprobe…"
curl -L -o "$TMP/ffprobe.zip" "$FFPROBE_URL"
unzip -q -o "$TMP/ffprobe.zip" -d "$TMP/ffprobe_out"
cp "$TMP/ffprobe_out/ffprobe" "$DEST/ffprobe-$TARGET"
chmod +x "$DEST/ffprobe-$TARGET"

echo ""
echo "✓ Binaries saved to $DEST:"
ls -lh "$DEST"

echo ""
echo "Note: If you are building a universal macOS binary, also run:"
echo "  ARCH=x86_64  → produces ffmpeg-x86_64-apple-darwin"
echo "  ARCH=aarch64 → produces ffmpeg-aarch64-apple-darwin"
echo "Both are required for a universal .dmg."
