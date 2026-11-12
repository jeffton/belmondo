# Generated effects

Original serious mechanical/energy one-shots from ElevenLabs Sound Effects V3 through fal. Runtime WAV masters live in `public/audio/sfx/`; original MP3 outputs and complete prompt/request/hash/signal provenance are retained here. The WAV files are decoded MP3, not lossless generation.

28 generated assets cover 14 event categories. Lap and pickup use variant 2: their alternate takes differ substantially in RMS and require listening before enabling alternation. The remaining events alternate two takes. `src/generated-sfx.js` controls selection and per-event gains. Peak matching is not loudness matching.

The existing effects-volume bus, compressor, countdown/GO cues and continuous engine remain separate from music. Samples decode once at the first start, then play at the original event boundary. Muting, pause, lost focus and disposal stop sample voices; resuming does not resurrect old tails. A finish event cancels the lap cue emitted on the same frame.

## Integration

The caller must await `sound.start()` before constructing/starting a race. Invoke `sound.start()` and `music.play()` synchronously from the original input gesture, then await both before the menu/race state transition. Display startup errors and remain in the menu on failure. Do not queue late effects or substitute synthesis.

## Acceptance

CPU tests cover asset availability, variant selection, cooldown, finish/lap overlap, gain routing, pause/mute/focus/visibility, source cleanup and explicit load failure. Build and existing CPU suite are run in the isolated worktree.

Browser/audio capture remains an integration gate. `tests/audio.browser.mjs` captures the effects bus and checks mute/pause/blur; `tests/countdown.audio.browser.mjs` verifies preserved launch PCM. Capture each selected take with the speed/load engine and soundtrack, check clipping and event onset, and listen for mix balance (especially collision density, pickup/lap clarity and incoming warnings). Check real start/quit/restart, first-load failure and effects-volume controls on desktop/touch. No browser/GPU or subjective listening was performed by the integration worker.

Generation list-price estimate: $0.0816 for 28 successful requests; invoice not inspected. Commercial-use source: https://fal.ai/models/elevenlabs/sound-effects/v3.
