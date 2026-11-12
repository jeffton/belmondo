# Countdown voice acceptance

Candidate: `115bd52` with test-only module-loading and output-measurement follow-up. No finish-line relocation or two-second GO work is included.

- CPU: 386/386 tests; focused countdown/gantry/audio tests independently reviewed and passed. Build and formatting passed.
- Desktop 1100×700 and mobile/touch 390×844: real start gesture unlocks running AudioContext; THREE, TWO, ONE, GO each play once at the shared physical-board stage. Pause during THREE freezes countdown; resume does not replay speech. Restart repeats all four words exactly once.
- Post-compressor native effects output is audible; pause and mute RMS below 0.0001, unmute above 0.001. Desktop/mobile board screenshots show THREE and no HUD announcement.
- Actual decoded voice plus original launch cues rendered through OfflineAudioContext: stage peaks 0.484/0.597/0.546/0.645; RMS 0.050/0.053/0.060/0.079. No clipping; mute, pause and hidden states produce exact silence. Mix saved privately as `test-artifacts/countdown-launch.wav`.
- No subjective listening claim: available tools did not provide audio audition. Speech clarity against music remains a listening acceptance item, distinct from measured output and synchronization.

The native test used the eight authorized private soundtrack masters in the isolated build. Masters and QA captures are not committed.

Public smoke independently passed for `d767c10` (`index-D4HdIopK.js`): real gesture plays Eleven soundtrack, race advances, pause and quit work, no page errors. That public release contains no countdown voice.

All owned browsers and the isolated HTTP server were closed; shared browser/process state was untouched. GPU ownership was explicitly released.
