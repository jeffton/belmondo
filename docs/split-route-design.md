# Split routes

## Driving choices

**Kaiseki Coast:** the inner cliff gallery follows a linked reverse bend beneath open-sided weather covers. The outer route sweeps across a sea inlet on a supported viaduct, with low breakwaters outside the racing corridor. Shorter technical shelter competes with a longer open line. Both routes carry one weapon pad.

**Cinderline:** the lower route threads a narrow, continuous basalt gorge through opposing bends. The wider upper route follows a banked caldera-rim arc with an open horizon. Both routes carry one weapon pad; neither needs a compensating boost to compete.

The other five circuits retain their alignments: Whiteout's ridge/ice cutting, Monsoon's pressure conduit/reservoir ascent, Solar Array's industrial arcade/collector field, Noctilucent's grade-separated crossover and Vesper's market/rooftop split.

## Geometry and race rules

Both carriageways are physical road surfaces with their own tangents, distance metric, widths, banking and collision bounds. Route-local reverse bends change those surfaces, not steering forces. Their compact envelopes have zero first and second derivatives at their ends. Entry and merge retain coincident, level seams and the existing fork-warning signs.

Routes use a shared base-spline station and the same 32 ordered physical timing gates. This is not a general graph of independent road segments: there is one split interval per circuit. Ranking within a split measures station progress, not estimated remaining driving time. Both branches must physically earn their gates and merge.

AI branch preference remains racer-ID parity. Body integration, AI controls, ship contacts, jump physics, recovery and progression are unchanged. Existing layout IDs and on-device records remain intact. Historical Coast/Cinderline times were set on different fork geometry and are not directly comparable with fresh laps.

## Verification

Baseline: `99a4feb`. Each circuit's two branches were driven from the starting grid using the production AI/body integrator, all three craft and all three classes. Pickups were disabled for sector comparisons. The two authored circuits have 36 final single-body traversals, with no wall contacts, recoveries, stalls or wrong-branch steps; timing gates and merges are earned normally.

INDUCTION sector seconds, inner / outer:

| Circuit       |         Striker |          Raptor |          Wraith |
| ------------- | --------------: | --------------: | --------------: |
| Kaiseki Coast | 10.638 / 10.625 | 10.707 / 10.442 | 11.812 / 12.109 |
| Cinderline    |   7.928 / 8.014 |   7.430 / 7.369 |   9.411 / 9.705 |

The fastest route depends on craft. Across all three classes the clean sector difference remains below 4%; that is a design-regression tolerance, not a gameplay speed limit. It does not establish optimal human lap times.

Normal seven-NPC packs also earn both merges in all classes: 42/42 NPC traversals, no rail contacts or recoveries. Coast has ordinary ship-to-ship contact displacement; it is not a collision-free run. Displacement-step counts are not distinct collision counts. Cinderline's measured pack has no pair displacement.

`tests/creative-split-racing.test.js` checks clean traversal, fairness and gates. `tests/fork-diagnostics.mjs` writes reproducible road-only metrics; `tests/fork-pack-diagnostics.mjs` measures normal grid traffic. Geometry/environment tests cover joined noses, full banked-deck terrain clearance, open overhead racing envelopes, real inlet excavation and equal pickup types. Accepted physical hashes protect the five untouched circuits.

`tests/creative-splits.browser.mjs` renders actual physics-driven approach, decision, branch and merge sequences on desktop and portrait mobile. Sixteen before/after driving captures reach the merge with no recoveries or JavaScript errors; all 96 captured timing-gate assertions pass. Its labelled stationary pre-fork fixture is not a full human lap or touchscreen-input test. Before/after screenshots and video use the same chase camera.

Mean desktop draw calls / triangles: Coast 207.2 / 69,894 baseline and 205.8 / 68,802 authored; Cinderline 223.5 / 71,472 and 226.9 / 71,299. Portrait means: Coast 96.4 / 40,393 and 96.6 / 40,206; Cinderline 133.0 / 45,262 and 133.8 / 44,995. These are matched-stage scene-cost samples under headless SwiftShader, not physical-phone performance or subjective handling.

Focused tests pass. The expanded geometry/environment/flight matrix has four failures reproduced on unchanged baseline `99a4feb`: a stale Whiteout/Monsoon configuration snapshot, Solar/Night scene tests using obsolete numeric circuit indexes, and a palette assertion using obsolete indexes. No new failures remain in that matrix.
