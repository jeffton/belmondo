# Test ownership and cleanup

Tests own durable behavior, not a feature release's screenshots, exact source recipes or unrelated output hashes. Production code, package scripts and dependencies are unchanged by this cleanup.

## Inventory

Counts include tracked files under `tests/`, comments and blank lines. They are physical lines, unlike the earlier 32,918 JavaScript-code-line count.

| Inventory       | Before |  After |
| --------------- | -----: | -----: |
| Files           |    182 |    166 |
| Physical lines  | 34,199 | 30,759 |
| Node test cases |    946 |    921 |

The 25 removed Node cases comprise 11 immutable/historical fork snapshots, two pre-redesign frame hashes, one unrelated Solar output hash, two neutral-terrain acceptance snapshots and nine weaker ordinary legacy laps. Exact historical output identity is intentionally retired, not claimed equivalent to current behavioral coverage.

## Browser ownership

| Retired harness                                        | Maintained contract                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billboards.browser.mjs`                               | Advertising/infrastructure placement and clearance tests; scene smoke. Historical contact sheets retired.                                                                                                                                                           |
| `boost-placements.browser.mjs`                         | Pickups, boost-exits and weapons-browser behavior. Release-specific pad coordinates retired.                                                                                                                                                                        |
| `cinder-volcano.browser.mjs`                           | Volcano geometry, grounding and clearance; scene smoke. Screenshot composition retired.                                                                                                                                                                             |
| `solar-mountain.browser.mjs`                           | Mountain/geography/tunnel portal and corridor tests. Screenshot collector retired.                                                                                                                                                                                  |
| `creative-splits.browser.mjs`, `coast-nose-visual.mjs` | Coast player-input, creative-split racing, NPC driving, fork-camera and road-mesh. Duplicated release-video collectors retired.                                                                                                                                     |
| `finish-continuation.browser.mjs`                      | Podium-trophy's real finish/elimination, frozen results, continuing racers, records and result layout.                                                                                                                                                              |
| `flagship.browser.mjs`                                 | World-lifecycle preserves actual rendered restart/rebuild resource stability, detached old ships, spark reset and loaded texture reuse. Integrated/gameplay driving and scenery-clearance Node tests remain. Historical profiling and frontage screenshots retired. |
| `instruments.browser.mjs`                              | HUD, mobile-shell, touch-sizing, speed-units and shield behavior. Manually manufactured critical-state screenshot retired.                                                                                                                                          |
| `menu-preview.browser.mjs`                             | Actual-DOM preview-layout checks all 13 models at 16 headings and six sizes; menu-flow checks live rotation and lifecycle.                                                                                                                                          |
| `menu-safe-area.browser.mjs`                           | Menu-flow's native Chromium safe-area bounds, menu-layout, mobile-shell and zoom-policy. Exact CSS substitution recipes retired; no physical iOS claim.                                                                                                             |
| `menu.browser.mjs`                                     | Render-toggle, menu-dom/layout, controls-guide and paddock-return.                                                                                                                                                                                                  |
| `music-menu-start.browser.mjs`                         | Strict menu-music-input adds fresh pointer and touch activation; music-menu/focus/native-focus retain transport and OS-focus behavior.                                                                                                                              |
| `podium-trophy-public.browser.mjs`                     | Source-level podium and paddock-return. Minifier-dependent compiled-bundle rewriting retired.                                                                                                                                                                       |
| `release-finish.browser.mjs`                           | Circuit access, menu-race, sound-settings and paddock-return.                                                                                                                                                                                                       |
| `http2-vhosts.mjs`                                     | Cross-service production diagnostic, not game coverage; intentionally removed.                                                                                                                                                                                      |

`integrated.browser.mjs` retains driving, menu traffic, finish and four-digit HUD. Its obsolete public/UI/pace scopes assumed three tracks, five laps and old controls. Menu, thrust-input, input-chords, launch and speed-class tests own those current behaviors.

Retained menu-flow/layout/podium fixtures use the current Return-to-Paddock contract: selected Enter/A returns to tracks, not craft selection. Paddock-return independently enforces inert Escape/B.

## Simulation ownership

- Banking, contacts, rail geometry/profile and road projection retain current all-seven-track contracts, including the regressions that exposed Cinderline/Vesper bank gradients.
- Terrain retains actual banked full-width mesh clearance, triangle queries and collision sweeps. Neutral-topology byte identity is acceptance history, not a persistent product requirement.
- Legacy-world-race retains full-terrain ordinary/TURBO laps across craft, classes and both branches. Legacy-redesign retains technical-point TURBO and seeded merge matrices instead of repeating weaker no-terrain ordinary laps.
- Historical v3 fixtures and natural-fork AI tests remain: they exercise distinct geometry and real branch-preference/traffic regressions.
- `coast-independent-player.mjs` remains the CPU helper for the 18-case ordinary-player-input and route-fairness contract. Active fork diagnostics and their shared helper remain.
- Progression, records, all seven tracks, physics, controls, gameplay sound and autoplay contracts remain.

## Verification

- Fresh baseline `42ed0ee`: all 100 Node files, 946 unique tests pass; zero failures, skips or timeouts.
- Candidate: all 99 Node files, 921 unique tests pass; zero failures, skips or timeouts. All Node changes are included; later browser/docs changes do not alter that inventory. Evidence: `/var/tmp/belmondo-cleanup-{baseline,candidate}/summary.json` and per-invocation TAP logs. Empty name-filter shards are excluded from test counts.
- Browser PASS: World lifecycle; seven strict autoplay input cases; menu-flow desktop/portrait/landscape with native safe areas; menu-layout desktop/portrait; podium keyboard/touch/controller; preview six sizes × 13 models × 16 headings; HUD 21 cases; mobile-shell and touch-sizing three sizes; integrated four-digit HUD; menu PCM 18 states and first-touch/mute.
- Browser evidence: `/var/tmp/browser-cleanup-*.log` and `/var/tmp/belmondo-browser-cleanup-map.md`. Seven successful music shards are recorded in worker tool results; the original aggregate music log records a 55-second timeout, superseded by those bounded shards with unchanged assertions.
- Strict browser/worker typechecks, production build, repository formatting, whitespace checks and independent Sol review pass.

Runs are sequential and individual invocations are capped below one minute. The focused browser matrix does not claim every standalone browser script was executed, physical iOS/controller hardware validation or subjective visual/audio acceptance. Production files and dependencies are byte-identical to the baseline; this test-only change requires no deployment.

Independent review caught a retained CPU test's dependency on `coast-independent-player.mjs`; the helper was restored byte-identically before candidate verification. Review also checked executable references to every deleted harness and the maintained documentation links.
