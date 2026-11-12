const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Original noise-excited pressure/casing synthesis. Broad, inharmonic modes
// have no stable carrier note or harmonic ladder; speed opens the spectrum
// instead of playing a transposed melody. Buffers are built once at unlock.
export function createEngineBed(context, turbine) {
  const rate = 24000;
  const buffer = context.createBuffer(2, rate * 4, rate);
  const modes = turbine
    ? [
        [420, 2.4, 0.5],
        [1090, 3.1, 0.34],
        [2430, 2.1, 0.2],
      ]
    : [
        [67, 0.85, 0.9],
        [139, 1.4, 0.55],
        [281, 1.1, 0.3],
      ];
  const seam = Math.round(rate * 0.08);
  for (let channel = 0; channel < 2; channel++) {
    const output = buffer.getChannelData(channel);
    const samples = new Float32Array(output.length + seam);
    const resonators = modes.map(([frequency, q, gain]) => {
      const omega = (2 * Math.PI * frequency) / rate;
      const alpha = Math.sin(omega) / (2 * q);
      return {
        b: alpha / (1 + alpha),
        a1: (-2 * Math.cos(omega)) / (1 + alpha),
        a2: (1 - alpha) / (1 + alpha),
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
        gain,
      };
    });
    let seed = 1987 + channel * 401 + (turbine ? 1103 : 0);
    let pressure = 0;
    let exhaust = 0;
    let flutter = 0;
    // Warm up the filters before writing PCM; no initial filter transient.
    for (let i = -rate; i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 2147483647) * 2 - 1;
      pressure += 0.004 * (white - pressure);
      exhaust += 0.32 * (white - exhaust);
      flutter += 0.0011 * (white - flutter);
      let casing = 0;
      for (const mode of resonators) {
        const y =
          mode.b * (white - mode.x2) - mode.a1 * mode.y1 - mode.a2 * mode.y2;
        mode.x2 = mode.x1;
        mode.x1 = white;
        mode.y2 = mode.y1;
        mode.y1 = y;
        casing += y * mode.gain;
      }
      if (i >= 0) {
        const turbulence = turbine
          ? casing * 1.5 + exhaust * 0.2
          : Math.tanh((casing + pressure * 1.6) * 2.2) * 0.72;
        samples[i] = turbulence * (0.88 + clamp(flutter * 5, -0.2, 0.2));
      }
    }
    // Circular equal-power overlap: a continuous noise texture at the wrap,
    // not a fade to silence or a loop-rate click/pulse.
    const tail = samples.subarray(output.length);
    for (let i = 0; i < seam; i++) {
      const phase = (i / (seam - 1)) * Math.PI * 0.5;
      samples[i] = tail[i] * Math.cos(phase) + samples[i] * Math.sin(phase);
    }
    output.set(samples.subarray(0, output.length));
  }
  return buffer;
}

export function updateEngineSound(
  motor,
  turbine,
  t,
  speed,
  boost,
  load,
  controls,
) {
  const thrust =
    controls.throttle === undefined ? 1 : Number(controls.throttle);
  const drive = clamp(thrust, 0, 1) * (controls.brake ? 0.3 : 1);
  const pressure = Math.max(0, load);
  const airborne = controls.grounded === false;
  const target = (param, value, smoothing = 0.14) =>
    param.setTargetAtTime(value, t, smoothing);
  target(motor.source.playbackRate, 0.85 + speed * 0.25 + boost * 0.06, 0.2);
  target(
    turbine.source.playbackRate,
    0.8 + speed * 0.48 + pressure * 0.08 + boost * 0.15,
  );
  target(
    motor.gain.gain,
    (0.21 + speed * 0.19 + drive * 0.11 + pressure * 0.055) *
      (airborne ? 0.72 : 1),
  );
  target(
    turbine.gain.gain,
    0.025 + speed * 0.16 + drive * 0.06 + pressure * 0.045 + boost * 0.065,
  );
  target(
    motor.filter.frequency,
    330 + speed * 430 + drive * 250 + pressure * 230,
  );
  target(
    turbine.filter.frequency,
    1100 + speed * 2300 + drive * 600 + boost * 1000,
  );
}
