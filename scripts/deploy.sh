#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run build
release="/var/www/antigrav/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 755 "$release"
sudo cp -a dist/. "$release/"
sudo ln -s "$release" /var/www/antigrav/next
sudo mv -Tf /var/www/antigrav/next /var/www/antigrav/current
printf 'Deployed %s\n' "$release"
