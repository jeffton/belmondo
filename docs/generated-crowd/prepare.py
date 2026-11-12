#!/usr/bin/env python3
"""Prepare and measure a stereo crowd loop without a fade-to-silence seam."""
import hashlib
import json
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent
RATE = 44100
SOURCE = ROOT / "original.mp3"


def metrics(samples):
    return {"peakDbfs": float(20 * np.log10(max(float(np.max(np.abs(samples))), 1e-12))), "rmsDbfs": float(20 * np.log10(max(float(np.sqrt(np.mean(samples.astype(np.float64) ** 2))), 1e-12))), "finite": bool(np.isfinite(samples).all()), "clippedSampleCount": int(np.sum(np.abs(samples) >= 1))}


probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(SOURCE)]))
stream = next(s for s in probe["streams"] if s["codec_type"] == "audio")
channels = int(stream["channels"])
raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(SOURCE), "-ar", str(RATE), "-af", "highpass=f=100,lowpass=f=6500", "-f", "f32le", "-"])
samples = np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()
assert np.isfinite(samples).all() and len(samples) > RATE * 6
# Circular cosine overlap: the output ends at original head[L-1] and begins
# at head[L]. Both joins therefore preserve adjacent original samples.
length = int(RATE * 0.25)
weight = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, length)))[:, None]
seam = samples[-length:] * (1 - weight) + samples[:length] * weight
loop = np.concatenate([samples[length:-length], seam])
# Distant ambience with headroom; event gain/proximity is owned by the game.
rms = float(np.sqrt(np.mean(loop.astype(np.float64) ** 2)))
gain_db = min(-24 - 20 * np.log10(rms), -6 - 20 * np.log10(float(np.max(np.abs(loop)))))
loop *= 10 ** (gain_db / 20)
pcm = np.round(loop * 32767).astype("<i2")
output = ROOT / "crowd-grandstands.wav"
with wave.open(str(output), "wb") as wav:
    wav.setnchannels(channels)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes())
normalized = pcm.astype(np.float64) / 32768
measured = metrics(normalized)
assert measured["finite"] and measured["clippedSampleCount"] == 0 and measured["peakDbfs"] <= -5.99
boundary_delta = np.abs(normalized[0] - normalized[-1])
adjacent_delta = np.abs(np.diff(normalized, axis=0))
assert float(boundary_delta.max()) <= float(adjacent_delta.max())
# No global fades: RMS around the wrap should remain near the surrounding bed.
edge = int(RATE * 0.05)
wrap_rms = float(np.sqrt(np.mean(np.concatenate([normalized[-edge:], normalized[:edge]]) ** 2)))
body_rms = float(np.sqrt(np.mean(normalized ** 2)))
wrap_ratio = wrap_rms / body_rms
assert 0.2 < wrap_ratio < 3
subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"], check=True)
# A two-repeat WAV makes external audition of the seam straightforward.
with wave.open(str(ROOT / "loop-two-repeats.wav"), "wb") as wav:
    wav.setnchannels(channels)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes() * 2)
provenance = json.loads((ROOT / "provenance.json").read_text())
manifest = {"project": "BELMONDO", "assetCount": 1, "model": provenance["model"], "requestedLoop": True, "requestId": provenance["requestId"], "successCount": 1, "rejectedCount": 0, "listedEstimateUsd": provenance["listedEstimateUsd"], "billing": provenance["billing"], "commercialUseSource": provenance["commercialUseSource"], "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "source": {"file": str(SOURCE), "sampleRate": int(stream["sample_rate"]), "channels": channels, "encoding": stream["codec_name"], "decodedDurationSeconds": len(samples) / RATE}, "asset": {"id": "crowd-grandstands", "file": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "durationSeconds": len(pcm) / RATE, "bytes": output.stat().st_size, "sampleRate": RATE, "channels": channels, "encoding": "16-bit PCM WAV decoded from generated MP3192; not lossless generation", "loop": True, "metrics": measured}, "processing": {"highpassHz": 100, "lowpassHz": 6500, "circularCosineCrossfadeSeconds": 0.25, "gainDb": float(gain_db), "targetRmsDbfs": -24, "peakCeilingDbfs": -6, "fadeToSilence": False}, "loopValidation": {"boundaryDeltaMax": float(boundary_delta.max()), "internalDeltaMax": float(adjacent_delta.max()), "wrapRmsToBodyRatio": wrap_ratio, "description": "Circular overlap preserves adjacent source samples at wrap; no global fade-to-zero or periodic silence dip. Decode and sample continuity measured, not subjective listening."}, "integration": {"event": "proximity ambience around actual authored grandstands", "spatial": "Use distance to stand positions and smooth gain in/out; no global persistent crowd away from stands. Keep conservative against engine/music.", "lifecycle": "Single looping source routed through effects volume, pause/mute/blur gating; cleanup on quit/dispose. Preserve current SFX release and integrate as separate crowd stage.", "repoState": "Read-only src/audio.js search found no crowd/spectator/ambience; spectators exist only as finish-district geometry."}, "audition": "No human or audio-understanding listening available. Prompt asks for distant cheering/claps without announcer/music/engines; semantic content not independently auditioned."}
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"asset": manifest["asset"], "loopValidation": manifest["loopValidation"], "listedEstimateUsd": manifest["listedEstimateUsd"]}, indent=2))
