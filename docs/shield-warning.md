# Shield warning audio

The player’s `critical` event plays one discreet 220 ms chime through the effects bus. `critical-clear` stops it immediately. No speech, looping alarm, timer, pending queue or replay on unmute/resume.

Race owns the 25% threshold and player-only entry/clear events: falling into 0 < shield ≤ 25 warns once; healing above 25 clears it and permits a later entry to warn again. Finish/elimination also clears the warning. This audio change does not modify that state machine or the HUD.

`python3 scripts/generate-shield-warning.py` reproduces the original mono 24 kHz PCM chime using Python’s standard library: 960/1440 Hz partials under a soft envelope. No samples, voice model, API, external dependency or generation fee. Playback gain is 0.65 before the existing effects volume and master processing.

CPU lifecycle tests cover one-shot playback, clear cancellation without new sources, reentry, pause and mute. Offline audio tests expect audible critical PCM and exact silence when cleared before rendering; native combined acceptance is pending serialized browser ownership.
