# Race announcer

One synthetic robotic voice announces THREE, TWO, ONE, GO at the physical start signal; LAP TWO, LAP THREE, LAP FOUR or FINAL LAP on entry to the corresponding player lap; and the acquired weapon name on player pickup. These announcements contain speech alone, without countdown tones, a start chord or lap/pickup effects. Engine, music, gameplay and later boost sounds retain their own audio. Speech uses the effects volume and mute controls; pause, blur, quit and restart discard active speech rather than replaying it. No HUD announcement or music transport change.

The race countdown owns timing. The gantry and announcement read `countdownBoardStage(race)` on the same animation frame. Speech buffers load before a race starts, through the gesture-unlocked effects AudioContext. No browser speech service, network synthesis, added runtime dependency or generation fee.

## Source

`bash scripts/generate-countdown-voice.sh` reproduces the mono 24 kHz PCM clips using eSpeak NG 1.52.0 and FFmpeg. Original English text; no voice cloning, reference audio, samples or performer imitation. Low-pitched synthetic voice with band limiting and a 14 ms metallic reflection; initial silence removed. These tool-generated recordings contain no eSpeak program code or voice database. Thirteen clips cover the grid, lap entries and five weapon names, all with the same voice and processing.

## Interruption

Speech has one active announcement, with no pending queue. Countdown takes precedence over lap announcements; lap announcements take precedence over inventory. Equal-priority events replace older speech, so a newer inventory item cannot leave an obsolete weapon name playing. Higher-priority speech discards an interrupting lower-priority event. Finish stops speech before its existing finish effect. AI progression and pickups do not emit player announcements. The finish crossing does not repeat FINAL LAP.

## Acceptance

CPU: `node --test tests/countdown.test.js tests/start-gantry.test.js tests/generated-sfx.test.js`.

After exclusive browser/GPU ownership, `GAME_URL=http://127.0.0.1:PORT node tests/race-announcer.audio.browser.mjs` against the worktree’s Vite dev server checks real Race lap/pickup transitions and native audible speech, pause and mute on desktop and mobile. These are bounded seeded transitions, not full player-driven laps.

For countdown acceptance, serve the built game, run `node tests/countdown.audio.browser.mjs` for actual decoded voice-only PCM and clipping/mute/pause checks. Run `GAME_URL=http://127.0.0.1:PORT node tests/countdown-voice.browser.mjs` for gesture-started real race countdown, pause/resume, restart, desktop and mobile. Inspect the captured mix for speech clarity and physical-board synchronization. No autoplay-policy bypass.
