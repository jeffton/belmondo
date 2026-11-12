# Finish origin and grid approach

The actual timing plane, transverse stripe and dynamic board share the downstream endpoint of each authored finishing straight. Geometry stations remain fixed: forks, jumps, terrain, powerups, spectators and full-straight checkers retain their physical positions. All 32 ordered race gates are offset by `track.finishS`; physical forward crossings earn laps. The opening grid crossing does not award a lap.

| Course         | Endpoint authored u | Finish station (m) |
| -------------- | ------------------: | -----------------: |
| Kaiseki Coast  |               0.045 |              503.4 |
| Solar Array    |               0.045 |              536.5 |
| Noctilucent    |               0.045 |              507.4 |
| Whiteout       |               0.040 |              300.0 |
| Monsoon        |               0.040 |              307.7 |
| Cinderline     |               0.040 |              356.3 |
| Vesper Circuit |               0.025 |              294.3 |

Stations parameterize the authored spline; they are not exact travelled distances. The player grid is 18 station metres upstream, followed by seven nine-metre-spaced grid slots. Existing stored record keys remain intact. Each layout ID has a `-finish-end` suffix because the moved grid and timing boundary change time comparability; times are not migrated.

`countdownBoardStage(race)` is the shared voice/display contract: armed above three seconds, then 3/2/1, GO, idle. The countdown starts at 5.2 seconds, including two seconds of camera approach before the original 3.2-second launch window. Releases during approach arm deliberate input, but cannot charge thrust. Chase and cockpit views approach their racing poses; race time and bodies remain stationary until GO.

## CPU evidence

- 30 finish/board/district tests pass: all seven endpoints, complete upstream spectator coverage, stripe alignment, three-class grid launches, retired-origin crossings, real 100 m approaches, earned lap/final crossings and recorded-canvas readability/state changes.
- 44 physics/launch/intro tests pass, including five earned laps, reverse crossings, checkpoint rescue, actual NPC laps on every production course, intro release/charge boundaries, timestep independence and restart.
- Four terrain/rescue tests and the class-independent countdown-clock test pass.
- Production build, changed-file formatting and `git diff --check` pass. Independent Sol review approved after the intro-release fix.
- A separate comparison sampled 12,000 stations on each of three branches per course. Position, tangent, road-right, width and bank hashes match the parent candidate byte-for-byte for all seven courses.

The complete inherited suite exceeded the 60-second run deadline and contains pre-existing composition-fixture mismatches being handled by the integration owner. This is focused acceptance, not a claim of a complete clean integrated suite.

## Serialized visual gate

No GPU/browser was used for this change. Before release, verify actual approach/pass views for all seven endpoints, crisp stripe/board alignment, upcoming lap and FINISH readability, desktop/portrait/landscape chase and cockpit views, full spectator-straight coverage, and the two-second camera approach on start/restart. Voice integration must use the shared stage contract and be checked with actual game gestures. Existing historical board captures are not evidence for this placement.
