import { SFX_CUES } from "./generated-sfx.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.paused = false;
    this.volume = 0.7;
    this.started = false;
    this.hidden = false;
    this.lastEffect = new Map();
    this.sources = [];
    this.sampleBuffers = new Map();
    this.sampleVoices = new Set();
    this.sampleIndices = new Map();
    this.ready = null;
    this.onBlur = () => {
      this.hidden = true;
      this.applyVolume();
    };
    this.onFocus = () => {
      this.hidden = document.hidden;
      this.applyVolume();
    };
    this.onVisibility = () => {
      this.hidden = document.hidden;
      this.applyVolume();
    };
  }

  async start() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
      // Resume is invoked in the original input gesture, before building the graph.
      const unlocked = this.context.resume();
      this.build();
      this.started = true;
      this.hidden = document.hidden;
      window.addEventListener("blur", this.onBlur);
      window.addEventListener("focus", this.onFocus);
      document.addEventListener("visibilitychange", this.onVisibility);
      this.applyVolume();
      this.ready = this.loadSamples();
      await Promise.all([unlocked, this.ready]);
    } else {
      await Promise.all([this.context.resume(), this.ready]);
    }
  }

  async loadSamples() {
    const context = this.context;
    const buffers = await Promise.all(
      Object.entries(SFX_CUES).map(async ([key, cue]) => {
        const variants = await Promise.all(
          cue.files.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok)
              throw new Error(`Sound effect ${url}: HTTP ${response.status}`);
            return context.decodeAudioData(await response.arrayBuffer());
          }),
        );
        return [key, variants];
      }),
    );
    this.sampleBuffers = new Map(buffers);
  }

  playSample(key) {
    const variants = this.sampleBuffers.get(key);
    const index = this.sampleIndices.get(key) ?? 0;
    this.sampleIndices.set(key, (index + 1) % variants.length);
    const source = this.context.createBufferSource();
    source.buffer = variants[index];
    const gain = this.context.createGain();
    gain.gain.value = SFX_CUES[key].gain;
    source.connect(gain);
    gain.connect(this.master);
    const voice = { key, source, gain };
    this.sampleVoices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.sampleVoices.delete(voice);
    };
    source.start();
  }

  stopSamples(key) {
    for (const voice of this.sampleVoices) {
      if (key !== undefined && voice.key !== key) continue;
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
      this.sampleVoices.delete(voice);
    }
  }

  build() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.16;
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // Shared two-second noise bed: no buffers or oscillators allocated per frame.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 731;
    for (let i = 0; i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      samples[i] = (seed / 2147483647) * 2 - 1;
    }
    // Original PCM, not stock oscillator waveforms: a vibrating hover chamber
    // and a separate, air-driven turbine with drifting blade resonances.
    this.motor = this.loopBed(this.createEngineBed(false), "lowpass", 700);
    this.turbine = this.loopBed(this.createEngineBed(true), "lowpass", 3200);
    this.launchCues = [3, 2, 1, 0].map((stage) => this.createLaunchCue(stage));
    this.previousSpeed = 0;
    this.previousUpdate = null;
    this.wind = this.loopNoise("lowpass", 900, 0.6);
    this.brake = this.loopNoise("bandpass", 2200, 1.2);
    this.boost = this.loopNoise("bandpass", 800, 0.7);
  }

  createEngineBed(turbine) {
    // Four seconds at 24 kHz, stereo: 0.77 MB per bed. Integer-cycle carriers
    // and modulation close the loop without a splice or repeated one-cycle buzz.
    const rate = 24000;
    const seconds = 4;
    const buffer = this.context.createBuffer(2, rate * seconds, rate);
    const tau = Math.PI * 2;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      let seed = 1987 + channel * 401 + (turbine ? 1103 : 0);
      let slow = 0,
        fast = 0;
      const phase = channel * 0.37;
      for (let i = 0; i < samples.length; i++) {
        const t = i / rate;
        seed = (seed * 16807) % 2147483647;
        const white = (seed / 2147483647) * 2 - 1;
        slow += 0.018 * (white - slow);
        fast += 0.18 * (white - fast);
        const drift = Math.sin(tau * 0.75 * t + phase);
        const flutter = Math.sin(tau * 3.25 * t + phase);
        if (turbine) {
          // Several non-octave casing modes; phase modulation spreads the
          // blade harmonics rather than exposing a single video-game note.
          const blade = tau * 183 * t + 1.7 * drift + 0.18 * flutter;
          const rotor =
            0.19 * Math.sin(blade) +
            0.09 * Math.sin(tau * 367.5 * t + 2.1 * drift + phase) +
            0.065 * Math.sin(tau * 731.25 * t + 2.8 * drift) +
            0.035 * Math.sin(tau * 1099.5 * t + flutter + phase);
          const air = (fast - slow) * (0.6 + 0.16 * flutter);
          samples[i] = rotor * (0.86 + 0.1 * Math.sin(tau * 1.25 * t)) + air;
        } else {
          const rotor = tau * 49 * t + 0.22 * drift;
          const chamber =
            0.39 * Math.sin(rotor) +
            0.13 * Math.sin(tau * 73.5 * t + 0.4 * drift + phase) +
            0.095 * Math.sin(rotor * 2 + 0.3 * flutter) +
            0.05 * Math.sin(tau * 147.25 * t + drift + phase);
          samples[i] =
            Math.tanh(chamber * (1.1 + 0.08 * flutter)) + slow * 0.65;
        }
      }
      // Only stochastic airflow needs a seam; blend its complete mix over
      // 30 ms so the loop is also safe at elevated boost playback rates.
      const seam = Math.round(rate * 0.03);
      const boundary = (samples[0] + samples[samples.length - 1]) * 0.5;
      for (let i = 0; i < seam; i++) {
        const blend = 0.5 - 0.5 * Math.cos((Math.PI * i) / seam);
        samples[i] = boundary + (samples[i] - boundary) * blend;
        const end = samples.length - 1 - i;
        samples[end] = boundary + (samples[end] - boundary) * blend;
      }
    }
    return buffer;
  }

  createLaunchCue(stage) {
    // Original charge-lock ritual: rising casing modes, granular air and a
    // soft mechanical latch. GO releases the same chamber into a turbine sweep.
    const launch = stage === 0;
    const duration = launch ? 0.86 : 0.52;
    const rate = 24000;
    const buffer = this.context.createBuffer(2, rate * duration, rate);
    const root = [196, 147, 123.47, 98][stage];
    const tau = Math.PI * 2;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      let seed = 3119 + channel * 607;
      let air = 0;
      let phase = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / rate;
        const progress = t / duration;
        seed = (seed * 16807) % 2147483647;
        const white = (seed / 2147483647) * 2 - 1;
        air += (launch ? 0.26 : 0.12) * (white - air);
        const rise = launch
          ? 1 + 1.9 * progress
          : 0.76 + 0.24 * Math.min(t / 0.13, 1);
        phase += (tau * root * rise) / rate;
        const attack = 1 - Math.exp(-t / (launch ? 0.018 : 0.012));
        const tail = Math.pow(1 - progress, launch ? 1.65 : 2.2);
        const chamber =
          0.3 * Math.sin(phase) +
          0.16 * Math.sin(phase * 2.01 + channel * 0.13) +
          0.085 * Math.sin(phase * 3.97 + 0.5 * Math.sin(tau * 7 * t));
        const lock =
          Math.exp(-t * 43) * (0.13 * Math.sin(tau * 1180 * t) + white * 0.12);
        const shimmer =
          0.045 * Math.sin(phase * 7.03 + channel * 0.4) * Math.exp(-t * 9);
        const airflow =
          air * (launch ? 0.7 : 0.23) * Math.sin(Math.PI * progress);
        samples[i] = (chamber + lock + shimmer + airflow) * attack * tail;
      }
    }
    return buffer;
  }

  launchCue(stage) {
    const source = this.context.createBufferSource();
    source.buffer = this.launchCues[stage === 0 ? 3 : 3 - stage];
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = stage === 0 ? 6600 : 3900;
    source.connect(filter);
    this.transient(
      source,
      filter,
      this.context.currentTime,
      source.buffer.duration,
      stage === 0 ? 1.05 : 0.9,
    );
  }

  loopBed(buffer, type, frequency) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.55;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.sources.push(source);
    return { source, gain, filter };
  }

  loopNoise(type, frequency, q) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.sources.push(source);
    return { source, gain, filter };
  }

  update(speedNormalized, boost, controls = {}) {
    if (!this.started) return;
    const t = this.context.currentTime;
    const speed = clamp(speedNormalized, 0, 1.4);
    const elapsed = this.previousUpdate === null ? 0 : t - this.previousUpdate;
    const acceleration =
      controls.acceleration ??
      (elapsed > 0 ? ((speed - this.previousSpeed) * 125) / elapsed : 0);
    this.previousSpeed = speed;
    this.previousUpdate = t;
    const load = clamp(acceleration / 25, -1, 1);
    const slip = clamp(Math.abs(controls.slip || 0) / 20, 0, 1);
    const air = Math.max(Math.abs(controls.air || 0), controls.brake ? 0.6 : 0);
    const airborne = controls.grounded === false;
    const target = (param, value, smoothing = 0.1) =>
      param.setTargetAtTime(value, t, smoothing);
    // Speed drives blade rate; acceleration opens the chamber under load.
    // Coasting unloads it rather than sounding like the throttle is stuck on.
    target(
      this.motor.source.playbackRate,
      0.84 + speed * 0.61 + boost * 0.09,
      0.16,
    );
    target(
      this.turbine.source.playbackRate,
      0.7 + speed * 0.83 + load * 0.06 + boost * 0.16,
      0.12,
    );
    target(
      this.motor.gain.gain,
      (0.17 + speed * 0.18 + load * 0.035) * (airborne ? 0.65 : 1),
    );
    target(
      this.turbine.gain.gain,
      0.035 + speed * 0.18 + Math.max(0, load) * 0.07 + boost * 0.05,
    );
    target(
      this.motor.filter.frequency,
      380 + speed * 650 + Math.max(0, load) * 260,
    );
    target(this.turbine.filter.frequency, 1400 + speed * 2400 + boost * 900);
    target(this.wind.gain.gain, speed * speed * 0.2 + slip * 0.07);
    target(this.wind.filter.frequency, 700 + speed * 2000 + slip * 600);
    target(
      this.brake.gain.gain,
      air * (0.06 + speed * 0.24) + slip * 0.09,
      0.035,
    );
    target(this.brake.filter.frequency, 1000 + speed * 2100);
    target(this.boost.gain.gain, boost * 0.18, 0.05);
    target(this.boost.filter.frequency, 700 + speed * 1500);
  }

  stopEngine() {
    if (!this.started) return;
    const t = this.context.currentTime;
    for (const loop of [
      this.motor,
      this.turbine,
      this.wind,
      this.brake,
      this.boost,
    ])
      loop.gain.gain.setTargetAtTime(0, t, 0.025);
  }

  transient(source, filter, t, duration, volume) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.006);
    gain.gain.linearRampToValueAtTime(volume * 0.8, t + duration * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(t);
    source.stop(t + duration + 0.01);
  }

  effect(kind, weapon = "") {
    if (!this.started || this.muted || this.paused || this.hidden) return;
    const now = this.context.currentTime;
    const cooldown = kind === "scrape" ? 0.16 : kind === "hit" ? 0.08 : 0;
    if (now - (this.lastEffect.get(kind) ?? -Infinity) < cooldown) return;
    this.lastEffect.set(kind, now);
    const key = kind === "fire" ? `fire:${weapon.toUpperCase()}` : kind;
    if (Object.hasOwn(SFX_CUES, key)) {
      // The final gate emits lap then finish in one frame; only the finish cue
      // should speak, rather than stacking both announcements.
      if (kind === "finish") this.stopSamples("lap");
      this.playSample(key);
      return;
    }
    switch (kind) {
      case "countdown":
        this.launchCue(typeof weapon === "number" ? weapon : 3);
        break;
      case "go":
        this.launchCue(0);
        break;
    }
  }

  applyVolume() {
    if (!this.master) return;
    if (this.muted || this.paused || this.hidden) this.stopSamples();
    this.master.gain.setTargetAtTime(
      this.muted || this.paused || this.hidden ? 0 : this.volume,
      this.context.currentTime,
      0.015,
    );
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applyVolume();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.applyVolume();
  }

  setVolume(volume) {
    this.volume = clamp(volume, 0, 1);
    this.applyVolume();
  }

  async dispose() {
    if (!this.context) return;
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stopSamples();
    this.sources.forEach((source) => {
      source.stop();
      source.disconnect();
    });
    await this.context.close();
    this.context = null;
    this.master = null;
    this.sources = [];
    this.lastEffect.clear();
    this.sampleBuffers.clear();
    this.sampleIndices.clear();
    this.ready = null;
    this.started = false;
  }
}
