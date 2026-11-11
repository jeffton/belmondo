# Audio and music

The engine mixes two original stereo PCM beds: a vibrating hover chamber with low rotor modes, and a phase-modulated turbine with inharmonic casing resonances and turbulent airflow. Playback rate follows world speed; acceleration changes turbine load, while braking, sideways slip and flight alter the air/body balance. Weapons and race signals use separate synthesized voices. No external audio assets or music uploads are used. Spotify streams cannot be integrated into games under its [Developer Policy](https://developer.spotify.com/policy).

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

`start()` creates/resumes the context directly in the gesture. Do not defer it behind rendering, asset loading or another awaited operation. Continuous effects begin with `update()`. Call `setPaused(true)` on pause and `setPaused(false)` on resume, or use the existing mute-on-pause integration. Blur and document visibility automatically gate effects; the game still owns its pause state. Music playback is independent.

`effect(kind, weapon)` accepts `countdown`, `go`, `pickup`, `fire`, `hit`, `scrape`, `boost`, `jump`, `land`, `incoming`, `lap` and `finish`. Fire distinguishes `MISSILE`, `PULSE`, `MINE`, `SHIELD` and `SURGE`. Pass race events unchanged rather than mapping landings and boosts to pickups. Repeated scrape/impact events are coalesced over their short sound tails. Continuous voices and the shared noise buffer are reused; short-lived voices disconnect when finished. A compressor controls combined peaks.

Run `node tests/audio.browser.mjs` with the development server running (`GAME_URL` defaults to `http://127.0.0.1:5178`). It measures actual live-game PCM after a Start gesture, pause, mute and resume. A twelve-second realtime stereo recording exercises idle, acceleration, cruise, airbrakes, boost, flight and engine-stop/finish; FFT measurements report bass, body, air and hiss energy alongside RMS and peaks. Every effect family also renders independently through Chromium's OfflineAudioContext. `GAME_URL=https://antigrav.roybot.se` checks deployed integration; isolated recordings and synthesis use the local source. Outputs under `test-artifacts/` include `audio-engine-drive.wav`, `audio-effects.wav` and `audio-metrics.json`.

## MusicPlayer

```js
const music = new MusicPlayer(({ name, count, playing, error }) => {
  // Update the player's UI.
});
await music.loadFiles(fileInput.files); // Also accepts files from a dropped folder.
await music.play();
music.pause();
await music.next();
music.volume = 0.5;
music.dispose();
```

`loadFiles(files)` accepts browser-readable MP3, M4A, AAC, Ogg/Opus, WAV, FLAC, WebM and other `audio/*` files without uploading them. Playback starts after `play()` or `next()`; `next()` loops through the playlist. The callback receives `{ name, count, playing, error }`, including browser playback failures. Replacing or disposing the playlist pauses playback and revokes its object URLs. Effects mute and volume do not change music settings.
