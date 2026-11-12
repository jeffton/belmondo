# Grandstand ambience

One original ElevenLabs Sound Effects V3 loop, routed through the effects bus. The generated MP3 and processing provenance are retained here; the runtime PCM WAV lives at `public/audio/sfx/crowd-grandstands.wav`.

The mix uses the rendered finish district's spectator foundation footprints and deck heights, not lap phase. Distance to each oriented footprint drives a 180 m acoustic falloff; the strongest nearby stand sets loudness, so denser stands cannot multiply the volume. Weighted screen-right direction sets stereo pan. Gain/pan glide over 180/120 ms. The loop persists across finish seams without retriggering.

Effects volume, mute, pause and lost-focus gating apply through the existing master. Quit, results and disposal stop/disconnect the crowd source. A later race creates one fresh source; music and tunnel processing are unchanged.

The processed loop is 7.75 seconds, stereo 44.1 kHz PCM16, RMS −24 dBFS. Maximum crowd gain is 0.5 before the effects master. Price-list estimate: $0.016; invoice not inspected. Signal/loop continuity were technically validated, not subjectively auditioned.

CPU acceptance covers all three rendered finish districts, finish/section continuity, vertical separation, falloff/pan, one-loop reuse and lifecycle cleanup. Browser/native PCM acceptance requires the coordinator's exclusive audio/GPU slot.
