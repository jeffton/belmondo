// Original industrial UI one-shots. Render once at the device sample rate;
// menu input plays a cached buffer immediately, including the first gesture.
export function createMenuSounds(context) {
  const palette = {
    move: {
      duration: 0.108,
      peak: 0.32,
      modes: [487, 1249, 2371, 3917],
      delay: 0,
      decay: 0.019,
    },
    confirm: {
      duration: 0.235,
      peak: 0.43,
      modes: [193, 613, 1069, 2711],
      delay: 0.027,
      decay: 0.043,
    },
    back: {
      duration: 0.18,
      peak: 0.37,
      modes: [271, 739, 1709, 3187],
      delay: 0.022,
      decay: 0.027,
    },
  };
  return new Map(
    Object.entries(palette).map(([kind, shape]) => {
      const rate = context.sampleRate;
      const buffer = context.createBuffer(
        2,
        Math.ceil(rate * shape.duration),
        rate,
      );
      const dry = new Float32Array(buffer.length);
      let seed = 317,
        low = 0,
        high = 0;
      for (let i = 0; i < dry.length; i++) {
        const t = i / rate;
        seed = (seed * 16807) % 2147483647;
        const noise = seed / 1073741823.5 - 1;
        // A band-limited mechanical rasp, not a pure electronic bleep.
        const opening =
          kind === "confirm" ? Math.min(1, t / 0.027) : 1 - t / shape.duration;
        const lowCut = kind === "back" ? 400 : 900;
        const highCut = 1700 + opening * 4300;
        low += (noise - low) * (1 - Math.exp((-2 * Math.PI * lowCut) / rate));
        high +=
          (noise - high) * (1 - Math.exp((-2 * Math.PI * highCut) / rate));
        const rasp = high - low;
        const strike = Math.max(0, t - shape.delay);
        const hit =
          t >= shape.delay
            ? Math.min(1, strike / 0.0007) * Math.exp(-strike / shape.decay)
            : 0;
        let metal = 0;
        for (let mode = 0; mode < shape.modes.length; mode++) {
          const f = shape.modes[mode];
          // Inharmonic FM sidebands give the impact a torn-metal edge.
          const phase = 2 * Math.PI * f * strike;
          metal +=
            (Math.sin(
              phase + 1.7 * Math.sin(phase * 1.413) * Math.exp(-strike / 0.012),
            ) *
              Math.exp(-strike * mode * 18)) /
            (1 + mode * 0.8);
        }
        const snap = noise * Math.exp(-strike / 0.0025) * hit;
        const pre =
          kind === "move"
            ? 0
            : rasp * Math.sin(Math.PI * Math.min(1, t / shape.delay)) * 0.7;
        const body =
          kind === "confirm"
            ? Math.sin(
                2 *
                  Math.PI *
                  (104 * strike + 0.7 * (1 - Math.exp(-strike / 0.009))),
              ) *
              Math.exp(-strike / 0.036) *
              hit *
              0.8
            : 0;
        const air =
          rasp * Math.exp(-t / (kind === "move" ? 0.016 : 0.043)) * 0.6;
        // Soft saturation binds the transient, metal and air into one object.
        const attack = Math.min(1, t / 0.0007);
        dry[i] =
          Math.tanh(
            (metal * hit * 0.55 + snap * 0.7 + body + air + pre) * 1.9,
          ) * attack;
      }
      // Small asymmetric room reflections add space without a long reverb wash.
      let peak = 0;
      for (let channel = 0; channel < 2; channel++) {
        const pcm = buffer.getChannelData(channel);
        const first = Math.round(rate * (channel ? 0.011 : 0.007));
        const second = Math.round(rate * (channel ? 0.023 : 0.019));
        for (let i = 0; i < pcm.length; i++) {
          const tail = Math.min(1, (pcm.length - 1 - i) / (rate * 0.012));
          pcm[i] =
            (dry[i] +
              (i >= first ? dry[i - first] * 0.19 : 0) -
              (i >= second ? dry[i - second] * 0.11 : 0)) *
            tail;
          peak = Math.max(peak, Math.abs(pcm[i]));
        }
      }
      for (let channel = 0; channel < 2; channel++) {
        const pcm = buffer.getChannelData(channel);
        for (let i = 0; i < pcm.length; i++) pcm[i] *= shape.peak / peak;
      }
      return [kind, buffer];
    }),
  );
}
