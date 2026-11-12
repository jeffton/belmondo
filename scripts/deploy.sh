#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
node scripts/stage-soundtrack.mjs /home/roy/audio-assets/belmondo/eleven-v2.5
npm run build
release="/var/www/belmondo/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 755 "$release"
sudo cp -a dist/. "$release/"
# Cached game bundles keep their original soundtrack URLs.
sudo cp -a archive/music/lyria-2026-11-11/*.mp3 "$release/music/"
sudo chmod -R a+rX "$release"
sudo ln -s "$release" /var/www/belmondo/next
sudo mv -Tf /var/www/belmondo/next /var/www/belmondo/current
printf 'Deployed %s\n' "$release"
