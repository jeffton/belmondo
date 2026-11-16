# Menu sound palette

Three original **ElevenLabs Sound Effects V3** stereo samples serve the menus:

- **Navigation:** a short, clean resonant electronic chirp, 170 ms.
- **Confirmation:** a fuller harmonic electronic acknowledgement, 256 ms.
- **Back:** an inward-building air/resonance gesture, 312 ms.

The approved back file has SHA-256 `d00740d3d46791ab8108a79fdef37fafa5cefca8a30c07363c4e82938b61732b`; its bytes, playback level and routing are preserved. The runtime audio engine, music and gameplay effects are unchanged.

## Generation and selection

Sources are generated through the server-side fal integration with `elevenlabs/sound-effects/v3`; no game recordings or artist replicas are supplied. [Provenance](menu-generated-sfx.json) records selected source hashes, prompts, processing and delivery hashes. Eight candidates cover two navigation and two confirmation briefs, with two takes each. Navigation uses the cleaner, shorter second chirp take; confirmation uses the second harmonic acknowledgement take rather than the bass-heavy first take or longer automatic-duration alternatives. Candidate waveforms, spectra and envelopes are compared before trimming, constant-gain adjustment, filtering and fades. Runtime files use 128 kbps MP3. Original candidates remain in the private audio-assets directory.

No trustworthy subjective audition is claimed. Audio-understanding services failed controlled tone/noise calibration; an additional Gemini 2.5 Flash check also misclassified the 200 Hz reference as high-pitched. Their assessments are not used for selection. Physical audio playback is unavailable.

[Model/API and commercial-use designation](https://fal.ai/models/elevenlabs/sound-effects/v3), [official ElevenLabs API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

## Playback and verification

Samples decode once. Context resume remains synchronous in the original gesture. Only the newest pending action survives initial decoding; suspended controller events are never queued. Muted, hidden and zero-volume actions cannot reappear later. Fetch/decode errors remain explicit; there is no synthetic replacement.

Realtime default-gain peaks are approximately .23/.37/.47 for navigation/confirmation/back. Warmed-compressor stereo measurements with all eight actual soundtrack excerpts give active-window RMS .055/.088/.060 and maximum combined peak .533. Navigation at 20 cues/second with music peaks at .317. The back-only mix measurements match the approved version. These are short-window measurements, not integrated LUFS or whole-track worst-case guarantees.

Browser tests cover keyboard/controller/touch, autoplay, a cold first touch, no-op/hover silence, pause/dialog transitions, volume zero and unchanged records. Unit tests also lock the approved back hash. Each test invocation is bounded to 55 seconds or less.
