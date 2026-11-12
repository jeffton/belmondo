# Six-course acceptance

WHITEOUT, MONSOON and CINDERLINE have independent routes, environments, pickup layouts and full-sphere horizons. Existing layout IDs, five-lap records, class pace and original-course physical/environment outputs are retained.

| Course     | Physical length | Minimum sampled radius | Signature                                           |
| ---------- | --------------: | ---------------------: | --------------------------------------------------- |
| WHITEOUT   |         7.50 km |                  163 m | Descending 270° glacial spiral and ascending valley |
| MONSOON    |         7.49 km |                  171 m | Curved dry lock below retained reservoirs           |
| CINDERLINE |         8.20 km |                  271 m | Three continuous-deck compression waves             |

## CPU and review

Source `76e080a`: **320 tests passed**, zero failures/skips, across all 36 CPU test files; build and formatting pass. The 54 new full-lap AI cases use authored terrain and cover every class, both forks, ordinary driving and finite TURBO at signature entry/exit. Production radius, projection, collision and progress guards remain enabled. Eight-ship C3 combat fields completed player laps; MONSOON had one AI combat recovery.

Original physical/environment hashes match their captured baselines. A separate 24,000-probe comparison preserves legacy rendered rail caps. Independent Sol reviews approved routes, environments, artwork and final integration. Astra advised on initial spatial concepts; design references are in [course design](three-course-design.md).

## Native input

Frozen `310907d` uses the same routes, terrain heights and physics as `76e080a`; the latter changes natural scenery rendering only. An external read-only telemetry driver sends actual Playwright keyboard or CDP touch events through the native application. It does not write bodies, controls, progress, clocks or player AI state.

| Course     | Input / class / fork | Earned first lap | Minimum shield |
| ---------- | -------------------- | ---------------: | -------------: |
| WHITEOUT   | Keyboard / C1 / −1   |          56.56 s |          86.75 |
| WHITEOUT   | Touch / C3 / +1      |          46.90 s |          85.65 |
| MONSOON    | Keyboard / C2 / +1   |          53.07 s |          68.10 |
| MONSOON    | Touch / C1 / −1      |          61.80 s |          99.67 |
| CINDERLINE | Keyboard / C3 / −1   |          42.45 s |          89.50 |
| CINDERLINE | Touch / C2 / +1      |          58.67 s |          86.00 |

All six runs earned lap 2 and the requested fork, exercised first-person and pause/resume, and produced no JavaScript/HTTP errors. No progression rollback or airborne frame was observed. Recovery observations use rAF progression rather than a production recovery counter. MONSOON's keyboard run scraped substantially in the dry-lock bend; completion is not a pristine-handling claim.

## Rendered acceptance

Frozen `76e080a`: desktop 1280×720 and mobile 844×390 capture 48 new-course chase/first-person signature/fork views, four Solar baseline views and 24 cardinal panorama views. These are explicitly seeded visual fixtures, not driving evidence. Natural cliffs use grain/strata rather than architectural panels; geological formations root into actual terrain, and facilities occupy authored grounded footprints. MONSOON's retained water stays outside the dry racing chamber.

Three warmed rebuild cycles per profile retain identical scene-owned and rendered resource counts at deterministic poses. Sky translation is pixel-identical. No JavaScript/HTTP errors occurred. New-course sampled views span 56–254 draw calls and 27,618–83,594 visible triangles. Full scene geometry is approximately 201k/143k/146k triangles for WHITEOUT/MONSOON/CINDERLINE versus 195k for Solar.

Headless SwiftShader checks functionality and resource behavior, not physical-phone frame rate or subjective human driving feel. Raw traces and images remain private QA artifacts.
