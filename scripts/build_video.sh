#!/usr/bin/env bash
# Compose the narrated deck video: one still frame per slide + its narration.
# Usage: scripts/build_video.sh [slides_dir] [narration_dir] [out.mp4]
set -euo pipefail

FF="${FFMPEG:-/Users/lgf2111/.hermes/tools/ffmpeg-9.0.1-darwin-arm64/ffmpeg}"
SLIDES="${1:-docs/media/slides}"
NARRATION="${2:-docs/media/narration}"
OUT="${3:-docs/media/mandate-pitch.mp4}"
WORK="$(mktemp -d)"

# No ffprobe in this ffmpeg build; parse the banner instead.
# ffmpeg -i alone exits 1 ("no output file"), which trips pipefail — hence `|| true`.
duration_of() {
  local banner
  banner=$("$FF" -i "$1" 2>&1 || true)
  echo "$banner" | awk '/Duration:/ {print $2}' | tr -d ',' \
    | awk -F: '{printf "%.2f", ($1*3600)+($2*60)+$3}'
}

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

: > "$WORK/list.txt"
for n in 01 02 03 04 05 06 07 08 09; do
  img="$SLIDES/slide-$n.png"
  audio="$NARRATION/slide-$n.ogg"
  [ -f "$img" ] || { echo "missing $img" >&2; exit 1; }
  [ -f "$audio" ] || { echo "missing $audio" >&2; exit 1; }

  seg="$WORK/seg-$n.mp4"
  "$FF" -y -loglevel error -loop 1 -framerate 30 -i "$img" -i "$audio" \
    -filter_complex "[0:v]scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=0.35[v]" \
    -map "[v]" -map 1:a \
    -af "apad=pad_dur=0.45" \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -shortest -movflags +faststart "$seg"
  echo "file '$seg'" >> "$WORK/list.txt"

  dur=$(duration_of "$seg")
  printf '  slide %s  %ss\n' "$n" "$dur"
done

"$FF" -y -loglevel error -f concat -safe 0 -i "$WORK/list.txt" -c copy -movflags +faststart "$OUT"

total=$(duration_of "$OUT")
printf 'wrote %s  (%ss)\n' "$OUT" "$total"
awk -v t="$total" 'BEGIN { if (t > 180) { printf "WARNING: over 3 minutes\n"; exit 1 } }'
