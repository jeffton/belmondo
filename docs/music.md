# Audio and music

The engine mixes two original stereo PCM beds: a vibrating hover chamber with low rotor modes, and a phase-modulated turbine with inharmonic casing resonances and turbulent airflow. Playback rate follows world speed; acceleration changes turbine load, while braking, sideways slip and flight alter the air/body balance. Weapons and race signals use separate synthesized voices. The built-in soundtrack contains twelve original generative compositions; local music is never uploaded. Spotify streams cannot be integrated into games under its [Developer Policy](https://developer.spotify.com/policy).

## AudioEngine

```js
const sound = new AudioEngine();
await sound.start(); // Invoke immediately inside Start's gesture, before rebuilding 3D.
sound.update(worldSpeed / 175, boostForce, {
  // Normalized actual boost, 0–1.
  air, // Airbrake input, -1…1.
  brake, // Main brake, boolean.
  acceleration, // World acceleration, m/s²; negative during deceleration.
  slip, // Lateral world velocity, m/s.
  grounded, // False during flight.
});
sound.effect(event.kind, event.text); // Fire events carry the weapon name.
sound.stopEngine(); // Finish: fade continuous beds, preserve the finish signal.
sound.setMuted(false);
sound.setPaused(false);
sound.setVolume(0.7); // Effects only, range 0–1; default 0.7.
await sound.dispose();
```

The stereo beds are generated once per context (four seconds each at 24 kHz, about 1.54 MB total), then continuously resampled by native Web Audio buffer sources. No audio buffers are allocated per frame. `acceleration` can be omitted when only speed is available; its rate of change then supplies engine load. Omitted `slip` is zero and omitted `grounded` retains the ground-hover balance.

`start()` creates/resumes the context directly in the gesture. Do not defer it behind rendering, asset loading or another awaited operation. Continuous effects begin with `update()`. Call `setPaused(true)` on pause and `setPaused(false)` on resume, or use the existing mute-on-pause integration. Blur and document visibility automatically gate effects; the game still owns its pause state. Music has its own volume and transport. The game starts it inside the Start gesture and pauses it with the race, on quit and on blur; resuming respects a manually paused music transport.

`effect(kind, weapon)` accepts `countdown`, `go`, `pickup`, `fire`, `hit`, `scrape`, `boost`, `jump`, `land`, `incoming`, `lap` and `finish`. Fire distinguishes `MISSILE`, `PULSE`, `MINE`, `SHIELD` and `TURBO`. Pass race events unchanged rather than mapping landings and boosts to pickups. Repeated scrape/impact events are coalesced over their short sound tails. Continuous voices and the shared noise buffer are reused; short-lived voices disconnect when finished. A compressor controls combined peaks.

Run `node tests/audio.browser.mjs` with the development server running (`GAME_URL` defaults to `http://127.0.0.1:5178`). It measures actual live-game PCM after a Start gesture, pause, mute and resume. A twelve-second realtime stereo recording exercises idle, acceleration, cruise, airbrakes, boost, flight and engine-stop/finish; FFT measurements report bass, body, air and hiss energy alongside RMS and peaks. Every effect family also renders independently through Chromium's OfflineAudioContext. `GAME_URL=https://antigrav.roybot.se` checks deployed integration; isolated recordings and synthesis use the local source. Outputs under `test-artifacts/` include `audio-engine-drive.wav`, `audio-effects.wav` and `audio-metrics.json`.

## MusicPlayer

```js
const music = new MusicPlayer(({ name, count, playing, error }) => {
  // Update the player's UI.
});
music.loadTracks(soundtrack, { shuffle: true }); // From src/soundtrack.js.
await music.loadFiles(fileInput.files); // Replaces the playlist with local files.
await music.play();
music.pause();
await music.next();
music.volume = 0.5;
music.dispose();
```

Import `MusicPlayer` from `src/music.js`.

`loadFiles(files)` accepts browser-readable MP3, M4A, AAC, Ogg/Opus, WAV, FLAC, WebM and other `audio/*` files without uploading them. Playback starts after `play()` or `next()`; `next()` loops through local files in selection order. The callback receives `{ name, count, playing, error }`, including browser playback failures. Replacing or disposing the playlist pauses playback and revokes its object URLs. `loadTracks(tracks)` accepts named URLs and replaces the playlist without starting playback. The built-in playlist uses shuffled bags: all twelve tracks play once before reshuffling, with no immediate repeat at a bag boundary. Loading/restoring the OST starts a fresh bag. Local files replace the built-in playlist without shuffling; BELMONDO OST restores all twelve default tracks. Effects mute and volume do not change music settings.

## Soundtrack credits

Original BELMONDO instrumentals generated with Google Lyria 3 Pro through fal.ai on 11 November 2026, without artist-name prompts or uploaded samples. MP3 masters are 44.1 kHz stereo, 320 kbps, with matched loudness.

| Track          | Duration | Musical brief                                  |
| -------------- | -------- | ---------------------------------------------- |
| Phase Index    | 2:51     | progressive trance / house and breaks          |
| Glass Current  | 2:59     | progressive breakbeat                          |
| Ion Drift      | 2:57     | big beat / atmospheric breaks                  |
| Vector Bloom   | 2:58     | melodic progressive trance / breaks            |
| Arc Relay      | 2:52     | electro / machine funk techno                  |
| Chrome Tension | 2:57     | dub techno / resonant progressive              |
| Static Orchard | 2:50     | atmospheric jungle / intelligent drum and bass |
| Signal Teeth   | 2:55     | melodic atmospheric breaks                     |
| Lattice Runner | 2:48     | tribal techno / polyrhythmic breaks            |
| Deep Circuit   | 2:54     | dark progressive house / progressive breaks    |
| Helix Pressure | 3:01     | techstep / futuristic drum and bass            |
| Afterimage     | 2:50     | dub-influenced progressive breakbeat           |

Total duration is 34:51. Musical labels describe the generation briefs, not independent listening assessments. All masters decode fully and have matched integrated loudness around −16.6 LUFS, with peak headroom. The original three masters are unchanged.

### Generation and terms

Google Lyria 3 Pro (`fal-ai/lyria3/pro`) generated these original instrumentals through fal.ai on 11 November 2026. Prompts use musical genre, arrangement and instrumentation descriptions; no artist/song names, uploaded samples or third-party audio inputs were used. Nine additional successful outputs expanded the approved three-track soundtrack to twelve. Five expansion requests were rejected without audio. No generation is performed by the game, and no API credentials are distributed.

The [model page](https://fal.ai/models/fal-ai/lyria3/pro) displayed **Commercial use** and **$0.08 per output** when checked on 11 November 2026; nine successful expansion outputs therefore have an advertised cost of $0.72. Actual account charges were not available. Use is subject to [fal terms](https://fal.ai/legal/terms-of-service); the commercial-use label is not an exclusive-copyright or indemnity guarantee. SynthID provenance was not intentionally removed. Source outputs, prompts, request metadata and measured masters are retained in the private generation archive `/var/tmp/belmondo-soundtrack-lyria/`; published files are level-adjusted 44.1 kHz stereo, 320 kbps MP3s.

Published MP3 SHA-256:

```text
phase-index.mp3 832001f1d36405e4a0d9ae59b0358d55955af3dc48b345281c4fa9cb3af138e1
glass-current.mp3 8bc2d82c22cde17348e72bea43b04b0ce5fdae16363c84c1d43643f724a991d4
ion-drift.mp3 e3cb1faed3580436dac5622c04e6d9126973fa001ea3dd89be14c6ff936ae667
vector-bloom.mp3 33d398af20c0232193ef232466bf540790c23176a28b67f4f65ef0e49eb5d5b1
arc-relay.mp3 6c0c1326d6538ec8e0c33b984b9808691262722befeb2d2705a1c96c2ad6a501
chrome-tension.mp3 869a05c610afed22b162144ea7b3d6fcf880263c965813d9004d9ff5a032ace6
static-orchard.mp3 26dec35c76b3b9edd58190d1417579f594aa0100faa10cb93d0acdc33578ef3f
signal-teeth.mp3 7bd119ef7a8d2c2f5627835bf2b7f11d4e35f945f8ff47845e05d6083d5e1ff7
lattice-runner.mp3 90f8f5c30f3b897cd8d1e3ab9c6b18d24118f4c876591eeade842ab1ed1b0426
deep-circuit.mp3 a47cf9b70463768e89687e594fe813e44d3d2100a4a64a8692e90aa293e4be45
helix-pressure.mp3 208758a8d62e46141a34db5b4d49ad3efc903d8d80b75702b0cd3c9f60b8988b
afterimage.mp3 591f9d7116fc2f0d5269465eb9f4cf3c2e2498ed4011803d73f97edb5fe46e3c
```
