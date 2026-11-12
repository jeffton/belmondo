# Dynamic timing board acceptance

One downstream physical board shows READY → 3 → 2 → 1 → GO → LAP n → FINISH. The timing-line portal retains its structure and checkers but has no separate FINISH sign. Lap and finish belong to the player; menu/demo shows standby. Countdown timing and race mechanics are unchanged.

## CPU coverage

`node --test tests/start-gantry.test.js tests/finish-district.test.js`

Recorded canvas operations verify dark-panel contrast, synchronized countdown thresholds, current player lap, finish, demo and restart. Actual `Race` instances seeded before timing gates exercise lap and finish transitions on all three courses. These are bounded state fixtures, not human-driven gameplay. Geometry, materials and the single canvas texture are reused. Finish-district checks retain the grounded portal, spectators and checkerboard without a second lettered sign.

## Browser acceptance

`SOURCE_URL=http://127.0.0.1:5233 node tests/dynamic-gantry.browser.mjs`

The isolated source fixture passed six profiles: all three courses at desktop 1280×720 and mobile 390×844. Actual Race countdown and seeded timing-gate transitions reached lap 2 and final FINISH, then demo and reset. Forty-eight chase/close-up screenshots were captured; inspected daylight, night and mobile views retain readable central countdown/lap/finish labels. No page or asset errors occurred. A repeated-render resource check and explicit LAP 5 screenshots are pending the revised harness run; the earlier update-only loop did not exercise GPU allocation at each transition. The fixture loads local fonts and uses a real mobile viewport. These captures are not human-driven full laps.

Artifacts: `test-artifacts/dynamic-gantry/report.json` and adjacent PNG files. Owned browser/server were closed after acceptance; the shared Batty browser was untouched.

Capture matrix:

- Desktop 1280×720: Coast and Solar daylight; Noctilucent night. Use low-res default, actual chase view approaching the timing line, and the same fixed close-up of the physical board.
- Mobile 390×844: Coast daylight and Noctilucent night, actual chase approach and fixed board close-up.
- For each course, record real Race countdown 3 → 2 → 1 → GO, then LAP 1; capture an earned next lap and the player's final gate crossing to FINISH. A seeded near-gate fixture is permitted for bounded transition captures but must be labeled as such, separately from actual keyboard/touch input.
- Give a rival a later lap while the player remains on lap 1: board stays LAP 1 and cannot show FINISH. Demo after a finish returns to standby; a fresh race returns to READY/countdown without stale lap or finish.
- Frame the timing-line portal and downstream board together: exactly one lettered timing display, with stands, ads and road checkers intact. Check FINISH and LAP 5 at distance and close-up for clipping/readability, especially night/mobile.
- Compare renderer geometry/texture counts before and after repeated lap/demo/restart transitions; no accumulating board resources. Record console errors. Do not describe scripted fixtures as human gameplay.

Stage scope: start-gantry rendering and narrow removal of the separate finish sign; no track, world, sky or race-mechanics changes.
