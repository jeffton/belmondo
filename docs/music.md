# Audio and music

The game uses browser-synthesized effects and local audio files; it does not upload music. Spotify playback is not included because Spotify's Developer Policy prohibits integrating Spotify streams into games: https://developer.spotify.com/policy.

## AudioEngine

Import `AudioEngine` from `src/audio.js`. Call `await audio.start()` from a user gesture (such as the Start button) to create/resume Web Audio. Then call `audio.update(speedNormalized, boosting)` while racing, with speed from `0` to `1` and a boolean boost state. `audio.effect(kind)` plays one of `pickup`, `fire`, `hit`, or `countdown`. `audio.setMuted(bool)` mutes or unmutes the synthesized audio.

## MusicPlayer

Import `MusicPlayer` from `src/audio.js` and pass an optional change callback:

```js
const music = new MusicPlayer(({ name, count, playing, error }) => {
  // Update track title, playlist count, play state, and any visible error.
});
await music.loadFiles(fileInput.files); // Also accepts files collected from a dropped folder.
await music.play();
music.pause();
await music.next(); // Advances and loops to the first track after the last.
music.volume = 0.5; // Range: 0–1.
```

`loadFiles(files)` selects browser-readable audio files (MP3, M4A, AAC, Ogg/Opus, WAV, FLAC, WebM, and other `audio/*` types) without uploading them. Playback starts only after `play()` or `next()`; browser playback failures are reported through the callback's `error` field. Each callback receives `{ name, count, playing, error }`; `name` is the current filename or `null`, and `error` is `null` when there is no current error. Replacing the playlist pauses playback and revokes its previous object URLs. Call `music.dispose()` when removing the player to stop playback and release its object URLs. Call `audio.dispose()` when leaving the game to stop its oscillators and close Web Audio.
