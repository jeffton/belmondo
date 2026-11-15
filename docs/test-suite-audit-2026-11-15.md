# Test suite audit — 15 November 2026

## Decisions

The suite inventory comprises 98 Node test files before cleanup and 65 `*.browser.mjs` files. All Node files were exercised; browser review concentrated on overlapping menu, guide, input, preview and sound coverage.

- Remove ten generated test cases that snapshot entire unrelated course configurations, sampled frames or rendered-world bytes. Delete `legacy-environment-output.test.js` and its unused digest builder. Retain course-specific geometry, clearance, driving and cross-course isolation contracts, including the newer accepted fork geometry snapshots.
- Remove historical text/selector blacklists and exact CSS/DOM-child recipes. Keep user-visible selection, reachability, hint ownership, result ordering and explicit input bindings.
- Run menu state, records, persistence, progression and stale-load races once. Run responsive navigation/geometry on desktop, portrait and landscape. Keep real WebGL preview and resource-lifetime checks; remove one near-identical preview viewport.
- Use semantic course identities. Course reordering had silently pointed many tests at unrelated tracks. Preserve district recipe indices separately from public track indices.
- Repair stale Web Audio, rumble and input doubles, and replace obsolete trigger-throttle fixtures with A throttle and L2/R2 airbrakes.
- Exercise shared banking and fork physics contracts on all seven tracks. Their original Coast/Solar/Noctilucent coverage had accidentally become Whiteout/Monsoon/Coast after reordering. Do not omit failing tracks to obtain a green run.

The cleanup removes one complete test file and ten obsolete snapshot cases. Across changed files there are 78 fewer static `assert`/`expect` call sites (net, not runtime assertion counts). Banking coverage adds sixteen meaningful cases; fewer test cases is not the goal.

## Failure classification

Most existing failures were stale course identities, missing mock APIs, obsolete input bindings or obsolete snapshots. Connected-seam tests select actual connected interiors instead of assuming fixed split phases. Locomotion tests disable NPC weapons so permanent combat elimination is not mistaken for stalled driving; armed combat and elimination tests remain separate.

Six Node contracts remain failing, without altered tolerances:

1. Whiteout's redesigned split has a minimum radius of 131.86 units; the existing contract requires 150.
2. Historical v3 Coast NPC 5 selects the opposite branch in class 0. The historical fixture and branch assertion remain.
3. Cinderline exceeds the banking roll-step envelope.
4. Vesper exceeds the banking roll-step envelope.
5. Solar's connected-seam crossing touches a wall.
6. Cinderline's splitter contact leaves the ship airborne at the checked endpoint.

These are behavioral/design mismatches requiring separate judgment, not disposable text assertions. A failing contract is not by itself proof of a player-visible bug.

Remove an unrelated final-full-health assertion from the Cinderline driving pack test. The test explicitly exercises hull-contact damage; its earned laps, positive shields, no walls/rescues and forbidden weapon damage remain checked.

Sound-settings verifies both silent and nonzero music PCM after staging the eight authorized soundtrack masters with `music:stage`. The isolated worktree lacks these ignored media files by default. Its analyser tap has a silent destination connection to ensure measurement without a second audible route. No product or soundtrack changes are part of this audit.

## Verification

Node tests run in file or course-filtered invocations capped at 55 seconds. `npc-driving` and `speed-classes` contain substantial physical driving matrices and require course shards rather than a single file-sized invocation. A timeout is not reported as a passing test.

The sharded Node run covers 916 tests: 910 pass and six unresolved contracts fail, with no timeouts after course sharding.

Passing browser checks: menu DOM/input/state, thrust/input switching, controls diagrams, sound settings with zero/nonzero PCM and persistent volumes, six preview layouts, and real WebGL menu flow on desktop, portrait and landscape. Build and changed-file formatting checks pass. Repository-wide formatting reports an existing issue in untouched `gamepad-flight.browser.mjs`. Full browser-suite approval is not claimed.

Test ownership should follow a behavior: one result-presentation contract, one pause/input integration, one measurable audio contract. Add viewport combinations when CSS or input behavior differs, not merely to repeat storage writes, string absence or the same application state machine.
