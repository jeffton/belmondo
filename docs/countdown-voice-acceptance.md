# Countdown voice acceptance

The start signal plays only THREE, TWO, ONE, GO. No countdown tone, start chord or turbine-sweep cue is layered with speech. Launch boost, engine, music and later boost effects are unchanged. No finish-line relocation or two-second GO work is included in this branch.

## Voice-only candidate

CPU tests exercise real countdown/GO effects and require exactly one speech source per crossing. The offline browser fixture compares each countdown/GO output sample-for-sample with the corresponding standalone spoken word, proving the absence of layered tones. Build and formatting are checked before integration.

Voice-only browser/audio acceptance is pending a serialized GPU grant. The private `test-artifacts/countdown-launch.wav` from the previous QA session contains layered launch sounds and is not this candidate's listening sample.

## Completed synchronization checks

The shared timing and speech lifecycle in `115bd52` passed real start-gesture tests at desktop 1100×700 and mobile/touch 390×844: THREE, TWO, ONE, GO play once at the shared physical-board stage. Pause during THREE freezes countdown; resume does not replay speech. Restart repeats all four words exactly once. Board screenshots show THREE without a HUD announcement.

Native post-compressor effects output was audible; pause/mute RMS was below 0.0001 and unmute above 0.001. These checks used the eight authorized private soundtrack masters. Masters and QA captures are not committed.

The user listened to the earlier layered sample and requested voice alone. No subjective listening claim is made for the voice-only candidate before a fresh sample exists.

Public smoke passed independently for `d767c10` (`index-D4HdIopK.js`): gesture plays Eleven soundtrack, race advances, pause and quit work, no page errors. That release contains no countdown voice.
