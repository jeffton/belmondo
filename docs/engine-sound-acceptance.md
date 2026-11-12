# Engine sound

Original procedural pressure and turbine beds replace the harmonic engine carriers. Broad noise excites inharmonic casing resonances; throttle, acceleration, speed, boost and airborne unloading shape pressure and brightness. The approved airbrake, wind, boost, countdown, music and gameplay are unchanged.

## CPU acceptance

- Six focused engine/SFX tests pass; production build, changed-file formatting and diff checks pass. Independent Sol review approves.
- Airbrake implementation regions match baseline `d767c10` byte-for-byte. Isolated two-second Web Audio graph renders also have identical PCM SHA-256: `e39bc5750f812334aa28683f242488268502d201e583e888e58e8466e259bfb1`.
- Sixteen-second before/after drive renders cover idle, acceleration, cruise, coast, airbrake, boost, airborne and stop. At cruise, strongest three-bin spectral share falls from 54.9% to 2.1%; centroid rises from 621 to 1,169 Hz. Cruise RMS is 0.094/0.074 before/after; peak 0.303/0.302. Boost peak is 0.347. These are offline measurements, not a subjective listening verdict.
- Offline mute/pause/hidden tails are silent; resume restores output and engine stop drains to zero.
- Two four-second stereo 24 kHz buffers retain 1,536,000 PCM bytes total. Persistent sources/nodes are unchanged. Six desktop buffer-build pairs measured 55–102 ms before and 34–69 ms after; mobile timing requires native QA.

Renders and scripts: `/var/tmp/belmondo-engine-qa/`. Rendering uses temporary `web-audio-engine@0.13.4` outside the repository; compressor/browser behavior requires native verification. No game dependency, generated asset, external recording, paid generation or additional license is involved.

Run focused tests with `node --test tests/engine-sound.test.js tests/generated-sfx.test.js`. The generic audio browser harness supports both development and deployed `GAME_URL` targets using local synthesis sources.

## Native acceptance

Pending serialized browser grant: real start gesture, mute, pause/resume, mobile mix, actual compression and music/airbrake intelligibility. Subjective listening remains pending. No deployment is part of this branch.
