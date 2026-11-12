# Dynamic timing board acceptance

One downstream physical board shows READY → 3 → 2 → 1 → GO, then announces the lap the player enters at the line. On the incoming leg of the authored home straight it shows the next lap; after crossing it shows that lap as current. The final approach shows FINISH / LINE, and only the earned final crossing changes the detail to RACE / COMPLETE. The timing-line portal retains its structure and checkers without a separate FINISH sign. Menu/demo shows standby; countdown timing and race mechanics are unchanged.

The announcement window begins at `track.config.sections.finishStraight[0]`: the existing straight/checkerboard approach, roughly 250–300 m before the line, with the board 42 m beyond it. It is an authored physical visibility district, not a new gameplay distance/quota. Gate-earned unwrapped player progression identifies the incoming leg for each lap; the initial grid/outgoing leg stays on LAP 1, and AI progress is irrelevant.

## CPU coverage

`node --test tests/start-gantry.test.js tests/finish-district.test.js`

Recorded canvas operations verify dark-panel contrast, synchronized countdown thresholds, current player lap, finish, demo and restart. Actual `Race` instances seeded before timing gates exercise the approach before every lap crossing and the earned crossing on all three courses. They cover initial LAP 1, the home-straight window boundary, upcoming LAP 2–5, final FINISH / LINE before completion, post-line current lap or RACE / COMPLETE, reset/demo and an AI leader that cannot change the display. These are bounded state fixtures, not human-driven gameplay. Geometry, materials and the single canvas texture are reused. Finish-district checks retain the grounded portal, spectators and checkerboard without a second lettered sign.

## Browser acceptance

`SOURCE_URL=http://127.0.0.1:5233 node tests/dynamic-gantry.browser.mjs`

Frozen source `f2f9356` passed six profiles: all three courses at desktop 1280×720 and mobile 390×844. Each profile exercised 17 states: synchronized countdown, initial LAP 1, all five incoming approaches and earned crossings, demo and reset. The harness drives actual Race bodies from seeded 100 m approaches through each timing gate and records the board's canvas lettering. Upcoming LAP 2–5 changes NEXT to CURRENT after crossing; final FINISH / LINE has `finished=false`, and the earned final crossing changes it to RACE / COMPLETE with `finished=true`. An AI leader cannot change the player's board.

Ninety-six chase/close-up screenshots were captured. Inspected approach/pass, daylight/night and mobile views preserve the central label without clipping, including upcoming LAP 5 and FINISH. At 100 m, low-res chase lettering is small; the close-ups confirm glyph readability and the passing view enlarges the board. Each lap/demo state in the five-cycle resource loop was rendered, not merely updated. Geometry/texture counts before and after matched in every profile: desktop 151/19, 159/23, 107/19; mobile 87/15, 78/15, 54/16. No page or asset errors occurred.

The fixture loads local fonts and uses a real mobile viewport. These are bounded seeded fixtures, not human-driven full laps.

Committed evidence: `docs/dynamic-gantry-browser-evidence.json`. Full local artifacts: `test-artifacts/dynamic-gantry/report.json` and adjacent PNG files. Owned browser/server were closed after acceptance; the shared Batty browser was untouched.

Capture matrix:

- Desktop 1280×720: Coast and Solar daylight; Noctilucent night. Use low-res default, actual chase view approaching the timing line, and the same fixed close-up of the physical board.
- Mobile 390×844: Coast daylight and Noctilucent night, actual chase approach and fixed board close-up.
- For each course, record real Race countdown 3 → 2 → 1 → GO, then LAP 1; capture upcoming LAP 2 before the line and LAP 2 after crossing, upcoming LAP 5 and final approach FINISH / LINE, then final crossing RACE / COMPLETE. Bounded seeded near-gate fixtures must be labeled separately from actual keyboard/touch input.
- Give a rival a later lap while the player remains on lap 1: board stays LAP 1 and cannot show FINISH. Demo after a finish returns to standby; a fresh race returns to READY/countdown without stale lap or finish.
- Frame the timing-line portal and downstream board together: exactly one lettered timing display, with stands, ads and road checkers intact. Check FINISH and LAP 5 at distance and close-up for clipping/readability, especially night/mobile.
- Compare renderer geometry/texture counts before and after repeated lap/demo/restart transitions; no accumulating board resources. Record console errors. Do not describe scripted fixtures as human gameplay.

Stage scope: start-gantry rendering and narrow removal of the separate finish sign; no track, world, sky or race-mechanics changes.
