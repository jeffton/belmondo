# Dynamic timing board acceptance

One downstream physical board shows READY → 3 → 2 → 1 → GO, then announces the lap the player enters at the line. On the incoming leg of the authored home straight it shows the next lap; after crossing it shows that lap as current. The final approach shows FINISH / LINE, and only the earned final crossing changes the detail to RACE / COMPLETE. The timing-line portal retains its structure and checkers without a separate FINISH sign. Menu/demo shows standby; countdown timing and race mechanics are unchanged.

The announcement window begins at `track.config.sections.finishStraight[0]`: the existing straight/checkerboard approach, roughly 250–300 m before the line, with the board 42 m beyond it. It is an authored physical visibility district, not a new gameplay distance/quota. Gate-earned unwrapped player progression identifies the incoming leg for each lap; the initial grid/outgoing leg stays on LAP 1, and AI progress is irrelevant.

## CPU coverage

`node --test tests/start-gantry.test.js tests/finish-district.test.js`

Recorded canvas operations verify dark-panel contrast, synchronized countdown thresholds, current player lap, finish, demo and restart. Actual `Race` instances seeded before timing gates exercise the approach before every lap crossing and the earned crossing on all three courses. They cover initial LAP 1, the home-straight window boundary, upcoming LAP 2–5, final FINISH / LINE before completion, post-line current lap or RACE / COMPLETE, reset/demo and an AI leader that cannot change the display. These are bounded state fixtures, not human-driven gameplay. Geometry, materials and the single canvas texture are reused. Finish-district checks retain the grounded portal, spectators and checkerboard without a second lettered sign.

## Browser acceptance

`SOURCE_URL=http://127.0.0.1:5233 node tests/dynamic-gantry.browser.mjs`

The prior current-lap stage passed six profiles: all three courses at desktop 1280×720 and mobile 390×844, with 48 chase/close-up screenshots and no page/asset errors. The upcoming-lap follow-up, repeated-render resource loop and explicit LAP 5 view await an exclusive GPU slot. Its revised harness drives actual Race bodies from seeded 100 m approaches through every lap crossing, checks recorded board lettering and AI independence, and renders each resource-test state. It loads local fonts and uses a real mobile viewport. These fixtures are not human-driven full laps.

Artifacts: `test-artifacts/dynamic-gantry/report.json` and adjacent PNG files. Owned browser/server were closed after acceptance; the shared Batty browser was untouched.

Capture matrix:

- Desktop 1280×720: Coast and Solar daylight; Noctilucent night. Use low-res default, actual chase view approaching the timing line, and the same fixed close-up of the physical board.
- Mobile 390×844: Coast daylight and Noctilucent night, actual chase approach and fixed board close-up.
- For each course, record real Race countdown 3 → 2 → 1 → GO, then LAP 1; capture upcoming LAP 2 before the line and LAP 2 after crossing, upcoming LAP 5 and final approach FINISH / LINE, then final crossing RACE / COMPLETE. Bounded seeded near-gate fixtures must be labeled separately from actual keyboard/touch input.
- Give a rival a later lap while the player remains on lap 1: board stays LAP 1 and cannot show FINISH. Demo after a finish returns to standby; a fresh race returns to READY/countdown without stale lap or finish.
- Frame the timing-line portal and downstream board together: exactly one lettered timing display, with stands, ads and road checkers intact. Check FINISH and LAP 5 at distance and close-up for clipping/readability, especially night/mobile.
- Compare renderer geometry/texture counts before and after repeated lap/demo/restart transitions; no accumulating board resources. Record console errors. Do not describe scripted fixtures as human gameplay.

Stage scope: start-gantry rendering and narrow removal of the separate finish sign; no track, world, sky or race-mechanics changes.
