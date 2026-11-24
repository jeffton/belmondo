# Fork diagnostics

`helpers/fork-diagnostics.js` exports `measureFork(sourceRoot, trackIndex)`. Importing it does not run simulations. `creative-split-racing.test.js` checks Whiteout, Coast and Cinderline against the explicit 4% route-time design target, using all three crafts and classes.

```sh
node --test tests/creative-split-racing.test.js
node tests/fork-diagnostics.mjs --source . --track 0 --output /var/tmp/forks
node tests/fork-diagnostics.mjs --source . --track 2 --output /var/tmp/forks
node tests/fork-diagnostics.mjs --source . --track 5 --output /var/tmp/forks --compare tests/fixtures/cinderline-fork-99a4feb.json
node tests/fork-pack-diagnostics.mjs --source . --track 0 --output /var/tmp/fork-pack
```

Each command completes in under 60 seconds on the development server. Run tracks separately; the CLI deliberately measures one track per invocation.

## Measurements

- Physical branch lengths integrate 2,048 road-frame segments between configured split endpoints. Elevation, ascent/descent, maximum grade, production plan-curvature and integrated 3D tangent turn are reported in world units/radians.
- Eighteen isolated runs per track start at the normal grid with the normal countdown and zero initial velocity. Assigning AI id 1/2 before simulation selects the existing production driver and its native branch preference. Position, velocity, branches, gates and inputs are not rewritten during traversal.
- Pickups are disabled by emptying the test race's pickup list. Road geometry and stock driver therefore determine comparison times; boost placement cannot compensate for an unfair route.
- Entry/exit times interpolate actual physical `contactS` crossings at 120 Hz. Recovery steps cannot count as crossings. Approach-to-clear accounting includes 4% of track length before the fork and 1.5% after its end.
- Rail-contact episodes/steps, recoveries, one-second progress stalls, backward steps, airborne time, physically observed separated branches and earned gate transitions are recorded. Gate tests require sequential awards and sufficient earned gates at the actual merge.
- Pack mode runs the unchanged seven NPCs with a neutral human player, no pickups, and no forced branch/id changes. `pairDisplacementSteps` is the contact solver's displaced-racer-step proxy, not a count of distinct collisions or damaging impacts. Contact metrics cover the first approach/merge only.

## Cinderline baseline

The comparison fixture records 18 Cinderline runs from commit `99a4feb`. It includes the source hashes and the fields used by `--compare`. Each run completed without rail contact or recovery. Generate other solo and pack reports with the commands above.

## Interpretation

These are stock-AI road tests, not human optimal racing times or a rendering audit. Matching physical length alone does not imply matching traversal time: craft handling and braking change the result. Id parity also affects normal AI racing-line preferences; each baseline/candidate comparison uses the same id, craft and class. A solo driver cannot expose pack interference, so the separate natural pack run is necessary. First-merge checks do not certify an entire armed race or future laps. A stall means under one world unit of net progress across a one-second sample, not every possible form of slow driving.
