# Race-position audit

Cinderline has a confirmed airborne gate-validation defect. Gate 16 lies inside its jump gap. A ship can cross that gate within the permitted lateral/height bounds and end the same physics step outside the hull-safe deck corridor. The endpoint check rejected the valid crossing, leaving ordered progress capped at that gate. The fix validates the swept crossing independently; continuous progress keeps its existing deck-contact restriction.

The deterministic fixture crosses at lateral 17.0522, height −0.0011, then ends at lateral 17.3970 beyond the hull-safe edge 17.3235. The original code retains gate 16; the fix earns gate 17. A separately seeded downstream landing demonstrates the consequence: ordinary driving leaves the original timing station frozen and changes 1st to 8th despite the ship physically leading. The fix retains first place. **The landing is staged, not a continuously flown reproduction of the reported incident.**

## Evidence

- Three-class focused regressions fail against the original source and pass with the fix.
- `tests/race-position.test.js`: 25 passing tests, including both fork routes and all 64 individual gate fixtures across two lap boundaries on every circuit/class. These are individual state fixtures, not continuous two-lap races.
- `tests/race-position.browser.mjs`: real WebGL and production renderer/HUD functions, manually stepped staged crossing and landing, all three classes. Gate 17, HUD 1/8, shield 100 and GL error 0.
- Complete stock-AI pack races on all seven circuits/classes: no progress stalls or backward progress; no single-step rank loss greater than one. Player finishes its configured 3/4/5 laps; other ships can remain racing. Weapons disabled; ordinary contacts, pickups and terrain retained.
- Two complete player-input Cinderline test-pilot races finished. Jump rescues rolled progress back approximately 337 units without a false gate stall.
- Independent approach/lip scans found no legal missed gate across 1,170 natural jump trajectories. The reported player's exact incident is not established.
- Physics/finish/elimination/origin/new-position group: 114/117 pass. The three physics failures reproduce against the original source: connected fork fixture, connected route selection fixture, and existing all-course AI-lap fixture. Separate independent review reproduced the same baseline failures.

Rescue/checkpoint rollback can legitimately change first to eighth if the field is closely grouped. No additional defect was established in rank ordering, lap wrap, remote-deck projection, split-route progress, elimination or finish precedence. The fix changes no movement, weapons, race balance, records or progression storage.

## Checks

```sh
node --test tests/race-position.test.js
node tests/race-position.browser.mjs
node --test tests/physics.test.js tests/finish-results.test.js tests/elimination.test.js tests/finish-origin.test.js tests/race-position.test.js
npm run build
```
