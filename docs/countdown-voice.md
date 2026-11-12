# Grid voice

Four original synthetic words — THREE, TWO, ONE, GO — accompany the physical start signal. Speech uses the effects volume and mute controls; pause, blur, quit and restart discard active speech rather than replaying it. No HUD announcement or music transport change.

The race countdown owns timing. The gantry and announcement read `countdownBoardStage(race)` on the same animation frame. Speech buffers load before a race starts, through the gesture-unlocked effects AudioContext. No browser speech service, network synthesis, added runtime dependency or generation fee.

## Source

`bash scripts/generate-countdown-voice.sh` reproduces the mono 24 kHz PCM clips using eSpeak NG 1.52.0 and FFmpeg. Original English text; no voice cloning, reference audio, samples or performer imitation. Low-pitched synthetic voice with band limiting and a 14 ms metallic reflection; initial silence removed. These tool-generated recordings contain no eSpeak program code or voice database. Four clips total roughly 62 KB.

## Acceptance

CPU: `node --test tests/countdown.test.js tests/start-gantry.test.js tests/generated-sfx.test.js`.

After exclusive browser/GPU ownership: serve the built game, run `node tests/countdown.audio.browser.mjs` for actual decoded voice/cue PCM and clipping/mute/pause checks. Run `GAME_URL=http://127.0.0.1:PORT node tests/countdown-voice.browser.mjs` for gesture-started real race countdown, pause/resume, restart, desktop and mobile. Inspect the captured mix for speech clarity and physical-board synchronization. No autoplay-policy bypass.
