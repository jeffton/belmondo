#!/usr/bin/env bash
# Regenerate the install and favicon sizes from the shared vector mark.
set -euo pipefail
cd "$(dirname "$0")/../public"

rsvg-convert --width 64 --height 64 --output art/belmondo-icon.png icon.svg
for size in 180 192 512; do
  rsvg-convert --width "$size" --height "$size" \
    --output "art/belmondo-icon-${size}.png" icon.svg
done
