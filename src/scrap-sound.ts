/** Dry relay click followed by a short capacitor-charge chirp. */
export function synthesizeScrapCue(sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * 0.24));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const relay =
      (Math.sin(t * 2 * Math.PI * 263) +
        0.38 * Math.sin(t * 2 * Math.PI * 1679)) *
      Math.min(1, t / 0.002) *
      Math.exp(-83 * t) *
      0.48;
    const chargeTime = Math.max(0, t - 0.025);
    const phase = 2 * Math.PI * (410 * chargeTime + 1550 * chargeTime ** 2);
    const charge =
      Math.min(1, chargeTime / 0.012) *
      (1 - Math.min(1, chargeTime / 0.215)) ** 2 *
      (Math.sin(phase) + 0.22 * Math.sin(2 * phase)) *
      0.38;
    samples[i] = relay + charge;
  }
  return samples;
}
