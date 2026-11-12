# Circuit rhythm

Kaiseki Coast and Solar Array use alternating physical corners rather than continuous one-direction loops. The changes affect the shared road surface, banking, fork frames, projection, pickups and terrain. Race physics and player controls are unchanged.

| Circuit       | Prior length |   Length | Opposite-direction cornering | Corner sequence                          |
| ------------- | -----------: | -------: | ---------------------------: | ---------------------------------------- |
| Kaiseki Coast |     5.771 km | 5.867 km |                        420 m | R12°–L49°–R33°–L22°, then L21°–R22°–L79° |
| Solar Array   |     6.547 km | 6.622 km |                        334 m | L15°–R25°–L53°, then L47°–R14°–L31°      |
| Noctilucent   |     6.125 km | 6.125 km |            1,033 m, retained | R115°–L117°–L112°–R115°                  |

Plan-view measurements sample the final centre deck at 2,000 stations and classify corners tighter than 700 m radius. The previous Coast and Solar layouts had no opposite-direction corners at that threshold. Heading totals describe contiguous substantial turns, not hairpins. The finer existing 1,500-station, three-route radius guard remains authoritative for local kinks: every route must stay at or above 150 m radius. Measurement smoothing is not used to waive that guard.

Coast has a compact early waterfront sequence and a longer climbing reversal after its split. Solar's early bends continue into the mountain tunnel; its second sequence spans the split and rejoin. The finish straights, jump approach, ramp, gap and aligned landing retain their accepted geometry. Jump markings use actual runway metadata and physical surface metres. Noctilucent retains its two-level crossing, descent and layout identifier.

`coast-3` and `solar-3` isolate records from the previous layouts; existing browser record keys are not migrated or deleted.

## Acceptance

CPU tests cover opposite steering demand, actual surface displacement, preserved finish/jump geometry, jump-marking clearance, the existing all-route radius guard, real AI through forks in all classes, all craft/pitch/class jumps, terrain sweeps, tunnel roof clearance and Night's crossing levels.

Five clean scripted single laps finished at 100 shield: Coast C1/C3 and Solar C2/C3 through keyboard events, and Night C3 through simulated gamepad input. Real CDP touch traversed both new Solar corner sequences at 100 shield. Clean full-touch-lap and analog-feel acceptance were not obtained: external-driver attempts failed on the unchanged jump approach. The cause is not established. See the local [QA summary](file:///var/tmp/belmondo-rhythm-gpu-summary.json) and [failed touch trace](file:///var/tmp/rhythm-solar-c2-touch-failed-slow-polling.json).

The following are diagnostic commands, not a passing-case matrix. Browser/GPU runs require a coordinator grant. The synthetic driver uses keyboard events, CDP multitouch or simulated gamepad input without modifying Race state or adding steering assistance:

```sh
INTEGRATED_SCOPE=drive INTEGRATED_COURSE=0 INTEGRATED_CLASS=0 INTEGRATED_INPUT=keyboard INTEGRATED_LAPS=1 node tests/integrated.browser.mjs
INTEGRATED_SCOPE=drive INTEGRATED_COURSE=1 INTEGRATED_CLASS=1 INTEGRATED_INPUT=touch INTEGRATED_LAPS=1 node tests/integrated.browser.mjs
INTEGRATED_SCOPE=drive INTEGRATED_COURSE=0 INTEGRATED_CLASS=2 INTEGRATED_INPUT=keyboard INTEGRATED_LAPS=1 node tests/integrated.browser.mjs
INTEGRATED_SCOPE=drive INTEGRATED_COURSE=1 INTEGRATED_CLASS=2 INTEGRATED_INPUT=touch INTEGRATED_LAPS=1 node tests/integrated.browser.mjs
INTEGRATED_SCOPE=drive INTEGRATED_COURSE=2 INTEGRATED_CLASS=2 INTEGRATED_INPUT=controller INTEGRATED_LAPS=1 node tests/integrated.browser.mjs
```

Set `GAME_URL` to the isolated approved snapshot. Each run has a seven-minute wall-clock bound. Reports retain actual control samples, both steering directions through each new sequence, braking, shield changes, chosen fork routes, flight/landing samples and consecutive-frame continuity checks. Inspect approach visibility, tunnel and waterfront clearances, deliberate braking before committed corners and both fork choices in chase/first-person views. Five-lap/result/record checks remain available with `INTEGRATED_LAPS=5`.
