import { SFX_CUES } from "./generated-sfx.js";
import { createEngineBed, updateEngineSound } from "./engine-sound.js";

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
    this.announcedResults = new WeakSet();
    this.sources = [];
    this.sampleBuffers = new Map();
    this.sampleVoices = new Set();
    this.sampleIndices = new Map();
    this.ready = null;
    this.crowdBuffer = null;
    this.crowd = null;
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

  async loadBuffer(url) {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Sound effect ${url}: HTTP ${response.status}`);
    return this.context.decodeAudioData(await response.arrayBuffer());
  }

  async loadSamples() {
    const [buffers, crowd] = await Promise.all([
      Promise.all(
        Object.entries(SFX_CUES).map(async ([key, cue]) => [
          key,
          await Promise.all(cue.files.map((url) => this.loadBuffer(url))),
        ]),
      ),
      this.loadBuffer("/audio/sfx/crowd-grandstands.wav"),
    ]);
    this.sampleBuffers = new Map(buffers);
    this.crowdBuffer = crowd;
  }

  updateCrowd({ gain, pan }) {
    if (!this.started || this.paused || this.muted || this.hidden) return;
    if (!this.crowd && gain > 0) {
      const source = this.context.createBufferSource();
      source.buffer = this.crowdBuffer;
      source.loop = true;
      const volume = this.context.createGain();
      volume.gain.value = 0;
      const panner = this.context.createStereoPanner();
      source.connect(volume);
      volume.connect(panner);
      panner.connect(this.master);
      source.start();
      this.crowd = { source, volume, panner };
    }
    if (!this.crowd) return;
    const t = this.context.currentTime;
    this.crowd.volume.gain.setTargetAtTime(gain, t, 0.18);
    this.crowd.panner.pan.setTargetAtTime(pan, t, 0.12);
  }

  stopCrowd() {
    if (!this.crowd) return;
    this.crowd.source.stop();
    this.crowd.source.disconnect();
    this.crowd.volume.disconnect();
    this.crowd.panner.disconnect();
    this.crowd = null;
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
    return voice;
  }

  announce(key, priority) {
    // Latest inventory replaces older inventory. Lap calls take precedence;
    // countdown takes precedence over both. Nothing waits in a stale queue.
    for (const voice of this.sampleVoices)
      if (voice.announcementPriority > priority) return;
    for (const voice of this.sampleVoices)
      if (voice.announcementPriority !== undefined) this.stopSamples(voice.key);
    this.playSample(key).announcementPriority = priority;
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
    this.motor = this.loopBed(createEngineBed(ctx, false), "lowpass", 700);
    this.turbine = this.loopBed(createEngineBed(ctx, true), "lowpass", 3200);
    this.previousSpeed = 0;
    this.previousUpdate = null;
    this.wind = this.loopNoise("lowpass", 900, 0.6);
    this.brake = this.loopNoise("bandpass", 2200, 1.2);
    this.boost = this.loopNoise("bandpass", 800, 0.7);
  }

  launchCue(stage) {
    this.announce(`voice:${stage}`, 3);
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
    const target = (param, value, smoothing = 0.1) =>
      param.setTargetAtTime(value, t, smoothing);
    updateEngineSound(
      this.motor,
      this.turbine,
      t,
      speed,
      boost,
      load,
      controls,
    );
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

  raceEvent(event, race, lapCount) {
    if (event.kind === "finish") {
      if (!race.finished || this.announcedResults.has(race)) return;
      this.announcedResults.add(race);
      this.effect("finish", race.position);
    } else if (event.kind === "lap") {
      if (!race.finished)
        this.effect(
          "lap",
          race.player.lap === lapCount ? "final" : race.player.lap,
        );
    } else this.effect(event.kind, event.text);
  }

  effect(kind, weapon = "") {
    if (!this.started || this.muted || this.paused || this.hidden) return;
    const now = this.context.currentTime;
    const cooldown = kind === "scrape" ? 0.16 : kind === "hit" ? 0.08 : 0;
    if (now - (this.lastEffect.get(kind) ?? -Infinity) < cooldown) return;
    this.lastEffect.set(kind, now);
    if (kind === "finish") {
      this.announce(`voice:result:${weapon}`, 4);
      return;
    }
    if (kind === "lap") {
      this.announce(`voice:lap:${weapon}`, 2);
      return;
    }
    if (kind === "pickup") {
      this.announce(`voice:${weapon}`, 1);
      return;
    }
    const key = kind === "fire" ? `fire:${weapon.toUpperCase()}` : kind;
    if (Object.hasOwn(SFX_CUES, key)) {
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
    this.stopCrowd();
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
    this.crowdBuffer = null;
    this.sampleIndices.clear();
    this.ready = null;
    this.started = false;
  }
}
