#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run build
release="/var/www/belmondo/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 755 "$release"
sudo cp -a dist/. "$release/"
sudo chmod -R a+rX "$release"
sudo ln -s "$release" /var/www/belmondo/next
sudo mv -Tf /var/www/belmondo/next /var/www/belmondo/current
printf 'Deployed %s\n' "$release"
