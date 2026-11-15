# Menu sound palette

Three original **ElevenLabs Sound Effects V3** samples replace procedural menu synthesis. Navigation is a brief bright electrical texture; confirmation is a fuller spectral-energy sweep; back uses an inward-building air/resonance gesture. Files are stereo MP3, approximately 228/394/312 ms and 18 KB combined. There are no visual, menu-action, music or gameplay-effect changes.

## Generation and selection

27 candidates were generated through the existing server-side fal integration. Prompts describe original futuristic racing-interface sounds; no game recordings or artist replicas were supplied. Generation used `elevenlabs/sound-effects/v3`, 0.5-second requests, prompt influence .75 and MP3/44.1 kHz/192 kbps output. The API's minimum duration is 0.5 seconds; runtime samples have been trimmed, modestly time-compressed, filtered, faded and levelled, then encoded at 128 kbps. Selected source hashes, prompts, processing and delivery hashes are in [the provenance manifest](menu-generated-sfx.json). Original candidates and generation records remain in the private audio-assets directory.

Listed generation estimate: $0.027 at $0.002/second; invoice not inspected. [Model/API and commercial-use designation](https://fal.ai/models/elevenlabs/sound-effects/v3), [official ElevenLabs API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

Selection used waveforms, spectra, event structure and envelopes, rejecting repeated pulses, heavy low-frequency hits and excessively thin high-frequency takes. No trustworthy subjective audition was available. Both fal audio-understanding and a Gemini audio-input route were investigated; their apparent listening assessments were discarded after a controlled 200 Hz tone / 3000 Hz tone / noise recording was incorrectly described as pitch-sweeping tonal effects. Those outputs are not listening evidence. No physical audio playback device was available.

## Playback and verification

Samples decode once at audio startup. Context resume remains synchronous in the original gesture. The first action waits only for the small menu pack, not the gameplay pack; only its newest pending cue survives decoding. Suspended controller events are not queued. Mute, hidden state and effects-volume zero cancel pending feedback. No synthetic replacement is provided on fetch/decode failure; errors remain explicit.

Actual realtime WebAudio peaks at default effects gain .8 were approximately .37/.48/.47 for navigation/confirm/back. A warmed-compressor stereo mix test with all eight actual soundtrack excerpts at production music gains measured active-window RMS .059/.080/.060, 2.9–9.2 dB above those music windows. Maximum combined peak was .587; navigation at 20 cues/second with music peaked at .543. These are short-window RMS measurements, not integrated LUFS or whole-track worst-case guarantees.

Browser tests cover keyboard, controller, touch, autoplay, no-op/hover silence, pause/dialog transitions, volume zero, unchanged records and a cold portrait touch gesture without an existing AudioContext. Offline renders verify silence/cleanup; unit tests cover deferred first playback, newest-only pending feedback, no suspended-controller burst and mute cancellation during loading. Each test invocation is bounded to 55 seconds or less.
