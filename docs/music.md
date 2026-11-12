# Audio and music

The engine mixes two original stereo PCM beds: a vibrating hover chamber with low rotor modes, and a phase-modulated turbine with inharmonic casing resonances and turbulent airflow. Playback rate follows world speed; acceleration changes turbine load, while braking, sideways slip and flight alter the air/body balance. Weapons and race signals use separate synthesized voices. The built-in soundtrack contains eight original generative compositions; local music is never uploaded. Spotify streams cannot be integrated into games under its [Developer Policy](https://developer.spotify.com/policy).

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

Run `node tests/audio.browser.mjs` with the development server running (`GAME_URL` defaults to `http://127.0.0.1:5178`). It measures actual live-game PCM after a Start gesture, pause, mute and resume. A twelve-second realtime stereo recording exercises idle, acceleration, cruise, airbrakes, boost, flight and engine-stop/finish; FFT measurements report bass, body, air and hiss energy alongside RMS and peaks. Every effect family also renders independently through Chromium's OfflineAudioContext. `GAME_URL=https://belmondo.roybot.se` checks deployed integration; isolated recordings and synthesis use the local source. Outputs under `test-artifacts/` include `audio-engine-drive.wav`, `audio-effects.wav` and `audio-metrics.json`.

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
music.setTunnel(true); // Active grounded contact within track.isTunnel(s).
await music.dispose();
```

Import `MusicPlayer` from `src/music.js`.

`loadFiles(files)` accepts browser-readable MP3, M4A, AAC, Ogg/Opus, WAV, FLAC, WebM and other `audio/*` files without uploading them. Playback starts after `play()` or `next()`; `next()` loops through local files in selection order. The callback receives `{ name, count, playing, error }`, including browser playback failures. Replacing or disposing the playlist pauses playback and revokes its object URLs. `loadTracks(tracks)` accepts named URLs and replaces the playlist without starting playback. The built-in playlist uses shuffled bags: all eight tracks play once before reshuffling, with no immediate repeat at a bag boundary. Loading/restoring the OST starts a fresh bag. Local files replace the built-in playlist without shuffling; BELMONDO OST restores all eight default tracks. Effects mute and volume do not change music settings.

### Tunnel acoustics

One lazy music-only AudioContext routes the existing media element through a dry path and a filtered 145 ms delay with 25% feedback. Both built-in and local tracks use this graph. Authored enclosed tunnels add an 11% wet layer, with 200 ms entrance/exit fades; the dry signal stays unfiltered and the wet path reaches exactly zero outside. The main loop uses the same `track.isTunnel(contactS)` helper as the tunnel meshes, while grounded. Solar Array's enclosed section is 20–28% around the circuit; Noctilucent's is 44–53%. Kaiseki's open interchange does not trigger echo.

Music volume is applied through an output GainNode rather than the media element's hardware-dependent volume property. Pause/blur gate the complete output, including delay tails. Track changes discard the previous delay graph but retain one context and media source; disposal disconnects the graph and closes its context. SFX retain their separate, unchanged audio context. Context resume and native media play are both invoked directly inside the play gesture.

`node tests/music-tunnel.browser.mjs` measures native default/local wet output, dry outside, fades, pause/volume silence and context reuse without WebGL. `node tests/music-tunnel-game.browser.mjs` checks the production main-loop hook with fixed contact positions across all three circuits; it is an integration fixture, not a driving test.

## Soundtrack credits

Eight original instrumentals generated with Eleven Music v2.5 (`elevenlabs/music/v2.5`) through fal.ai on 12 November 2026. The briefs explore the underground progressive, trance, techno, electro, breakbeat and jungle vocabulary of 1994–1999 racing soundtracks. No artist/song names, uploaded recordings or samples were used in generation. Musical descriptions are briefs, not claims of subjective listening.

| Track            | Duration | Musical brief                        |
| ---------------- | -------- | ------------------------------------ |
| Slipstream Glass | 3:00     | hypnotic progressive trance / house  |
| Recursive Blue   | 2:58     | weightless progressive trance        |
| Torque Syntax    | 3:00     | big beat / progressive breaks        |
| Delta Pressure   | 3:00     | warehouse acid techno                |
| Spectral Lattice | 3:00     | atmospheric jungle                   |
| Tidal Memory     | 3:00     | dub-inflected deep progressive house |
| Relay Bloom      | 3:00     | melodic early trance / techno        |
| Ceramic Phase    | 3:00     | electro / intelligent breaks         |

Total duration: 23:58. The approved Slipstream Glass composition is retained; each master has only constant playback-gain adjustment, targeting −16 LUFS without dynamic compression. Published MP3s are 48 kHz stereo, 320 kbps. All eight decode fully; measured true peaks range from −5.7 to −2.3 dBFS. `src/soundtrack.js` records their exact SHA-256 hashes. The twelve Lyria masters and their credits remain in [the archive](../archive/music/lyria-2026-11-11/README.md), outside the build. Deployment also retains their original `/music/*.mp3` URLs for cached game bundles; they are absent from the active playlist.

### Asset setup

The public repository contains metadata and code, not the Eleven Music audio. With authorized masters available:

```sh
npm run music:stage -- /path/to/authorized/masters
npm run build
```

Staging verifies all eight hashes before copying anything into ignored `public/music/eleven-v2.5/`. Missing or changed masters fail explicitly. Deployments use the private server directory `/home/roy/audio-assets/belmondo/eleven-v2.5`; `scripts/deploy.sh` stages these assets before building. Local music selection works independently and never uploads files.

Private generation records, original output bytes, prompts, request IDs, source snapshots and loudness measurements are retained outside Git. Seven additional three-minute generations have an advertised cost of $12.60 at FAL's $0.60 per output minute, rounded up to whole minutes; Slipstream Glass was a separate trial. Account-level billing is not exposed by the inference key. The [direct ElevenLabs API](https://elevenlabs.io/pricing/api) lists $0.15/minute; this release used the existing FAL integration. No generation API or credentials are shipped to players.

### Music rights

The eight Eleven Music soundtrack tracks are excluded from any repository software license. They are provided solely for playback within BELMONDO. No permission is granted to redistribute them separately, sublicense them, or reuse them in other projects or music libraries.

[Eleven Music terms](https://elevenlabs.io/eleven-music-model-specific-terms), dated 9 October 2026, permit media use in indie games. The definition requires game lifetime net revenue below $500,000 and developer/publisher game revenue below $1 million in the preceding financial year. Section 4.2 prohibits making a music library available for others' reuse without written authorization. The game serves ordinary browser audio assets; it does not offer a soundtrack download library or a license for reuse. Browser fetching and caching for game playback are part of delivering the game, not an offer of a reusable music collection.

FAL labels [the model](https://fal.ai/models/elevenlabs/music/v2.5) **Commercial use / Partner**. [FAL terms](https://fal.ai/legal/terms-of-service) also preserve applicable third-party restrictions. Neither that label nor these credits grants an exclusive copyright or a broad right to sublicense generated music. FAL's public materials do not specify a separate partner entitlement for stock-music libraries; no such entitlement is relied upon here.
