#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build the immutable first playable source, never the current game's working tree.
commit=6e0176e
build=$(mktemp -d /var/tmp/belmondo-v1-build.XXXXXX)
git archive "$commit" | tar -x -C "$build"
(
    cd "$build"
    npm ci
    npm test
    npm run build
)
release="/var/www/belmondo-v1/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 755 "$release"
sudo cp -a "$build/dist/." "$release/"
sudo chmod -R a+rX "$release"
sudo ln -s "$release" /var/www/belmondo-v1/next
sudo mv -Tf /var/www/belmondo-v1/next /var/www/belmondo-v1/current
printf 'Deployed original %s to %s (build retained at %s)\n' "$commit" "$release" "$build"
