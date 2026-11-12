"""Original, single 220 ms shield-entry chime; no samples or external tools."""

import math
import pathlib
import struct
import wave

rate = 24000
duration = 0.22
samples = []
for frame in range(round(rate * duration)):
    t = frame / rate
    envelope = math.sin(math.pi * t / duration) ** 1.5
    tone = math.sin(2 * math.pi * 960 * t) + 0.3 * math.sin(2 * math.pi * 1440 * t)
    samples.append(round(32767 * 0.2 * envelope * tone))

path = pathlib.Path(__file__).resolve().parents[1] / "public/audio/sfx/shield-critical.wav"
with wave.open(str(path), "wb") as output:
    output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
    output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
