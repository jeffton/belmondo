/** A heavy ejector strike, with a short metal ring and a damped latch. */
export function synthesizeScrapCue(sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * 0.2));
  const tau = 2 * Math.PI;
  const metalRate = 1 - Math.exp((-tau * 1900) / sampleRate);
  const bodyRate = 1 - Math.exp((-tau * 260) / sampleRate);
  let seed = 0x18cd57ab;
  let metalNoise = 0;
  let bodyNoise = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    metalNoise += (noise - metalNoise) * metalRate;
    bodyNoise += (metalNoise - bodyNoise) * bodyRate;

    // The actuator drops into its stop; the overtones are impact resonances,
    // not a separate pitched charge cue.
    const phase = tau * (70 * t + 0.9 * (1 - Math.exp(-t / 0.018)));
    const strike =
      (0.64 * Math.sin(phase) + 0.16 * Math.sin(2 * phase)) * Math.exp(-26 * t);
    const metal =
      (0.52 * (metalNoise - bodyNoise) +
        0.13 * Math.sin(tau * 367 * t) +
        0.08 * Math.sin(tau * 863 * t)) *
      Math.exp(-125 * t);
    const latchTime = Math.max(0, t - 0.028);
    const latch =
      (0.19 * Math.sin(tau * 119 * latchTime) +
        0.22 * Math.sin(tau * 421 * latchTime) +
        0.38 * (metalNoise - bodyNoise)) *
      Math.min(1, latchTime / 0.0015) *
      Math.exp(-46 * latchTime);
    samples[i] =
      (strike + metal + latch) *
      Math.min(1, t / 0.001) *
      Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.08));
  }
  return samples;
}
