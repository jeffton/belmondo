# Original playable prototype

https://belmondo-v1.roybot.se serves the first repository commit, `6e0176e`
(11 November 2026), titled **NULL // VECTOR**. It has three circuits, keyboard,
gamepad and touch controls, synthesized effects and local music selection.

This is historical gameplay, not the current BELMONDO: original controls,
physics, graphics and bugs are preserved. Storage belongs to the separate
origin; current records and settings are untouched.

Run `bash scripts/deploy-v1.sh` to build and publish the pinned source.
The script runs the original tests and creates a retained static release in
`/var/www/belmondo-v1`, independent of the current game's deployment.
Build directories are retained under `/var/tmp/belmondo-v1-build.*`.

Install `deploy/nginx-v1.conf` as
`/etc/nginx/sites-available/belmondo-v1.roybot.se`, symlink it into
`sites-enabled`, then run `sudo nginx -t && sudo systemctl reload nginx`.
Existing wildcard DNS and the roybot.se wildcard certificate serve this host.
Neither hostname redirects to the other.
