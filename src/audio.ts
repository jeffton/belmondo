import type { EngineControls, EngineLoop } from "./engine-sound.ts";
import type { MenuSound } from "./menu-sound.ts";

interface SampleVoice {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  announcementPriority?: number;
}
export interface AudioRaceEvent {
  kind: string;
  text?: string | number;
}
export interface AudioRace {
  finished: boolean;
  position: number;
  player: { eliminated: boolean; lap: number };
}
type CrowdVoice = {
  source: AudioBufferSourceNode;
  volume: GainNode;
  panner: StereoPannerNode;
};

import { SFX_CUES } from "./generated-sfx.ts";
import { MENU_SOUNDS } from "./menu-sound.ts";
import { createEngineBed, updateEngineSound } from "./engine-sound.ts";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class AudioEngine {
  declare context: AudioContext | null;
  declare master: GainNode | null;
  declare compressor: DynamicsCompressorNode;
  declare menuBus: GainNode;
  declare noise: AudioBuffer;
  declare motor: EngineLoop;
  declare turbine: EngineLoop;
  declare wind: EngineLoop;
  declare brake: EngineLoop;
  declare boost: EngineLoop;
  declare previousSpeed: number;
  declare previousUpdate: number | null;
  declare muted: boolean;
  declare paused: boolean;
  declare volume: number;
  declare started: boolean;
  declare hidden: boolean;
  declare lastEffect: Map<string, number>;
  declare announcedResults: WeakSet<AudioRace>;
  declare sources: AudioBufferSourceNode[];
  declare sampleBuffers: Map<string, AudioBuffer[]>;
  declare sampleVoices: Set<SampleVoice>;
  declare sampleIndices: Map<string, number>;
  declare ready: Promise<unknown> | null;
  declare menuVoices: Set<AudioBufferSourceNode>;
  declare menuBuffers: Map<string, AudioBuffer>;
  declare menuReady: Promise<void> | null;
  declare menuSequence: number;
  declare crowdBuffer: AudioBuffer | null;
  declare crowd: CrowdVoice | null;
  declare onBlur: () => void;
  declare onFocus: () => void;
  declare onVisibility: () => void;
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
    this.menuVoices = new Set();
    this.menuBuffers = new Map();
    this.menuReady = null;
    this.menuSequence = 0;
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
      const unlocked = this.context!.resume();
      this.build();
      this.started = true;
      this.hidden = document.hidden;
      window.addEventListener("blur", this.onBlur);
      window.addEventListener("focus", this.onFocus);
      document.addEventListener("visibilitychange", this.onVisibility);
      this.applyVolume();
      this.menuReady = this.loadMenuSamples();
      this.ready = Promise.all([this.loadSamples(), this.menuReady]);
      await Promise.all([unlocked, this.ready]);
    } else {
      await Promise.all([this.context!.resume(), this.ready]);
    }
  }

  async loadBuffer(url: string) {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Sound effect ${url}: HTTP ${response.status}`);
    return this.context!.decodeAudioData(await response.arrayBuffer());
  }

  async loadMenuSamples() {
    const buffers = await Promise.all(
      Object.entries(MENU_SOUNDS).map(
        async ([kind, cue]): Promise<[string, AudioBuffer]> => [
          kind,
          await this.loadBuffer(cue.url),
        ],
      ),
    );
    this.menuBuffers = new Map(buffers);
  }

  async loadSamples() {
    const [buffers, crowd] = await Promise.all([
      Promise.all(
        Object.entries(SFX_CUES).map(
          async ([key, cue]): Promise<[string, AudioBuffer[]]> => [
            key,
            await Promise.all(cue.files.map((url) => this.loadBuffer(url))),
          ],
        ),
      ),
      this.loadBuffer("/audio/sfx/crowd-grandstands.wav"),
    ]);
    this.sampleBuffers = new Map(buffers);
    this.crowdBuffer = crowd;
  }

  updateCrowd({ gain, pan }: { gain: number; pan: number }) {
    if (!this.started || this.paused || this.muted || this.hidden) return;
    if (!this.crowd && gain > 0) {
      const source = this.context!.createBufferSource();
      source.buffer = this.crowdBuffer;
      source.loop = true;
      const volume = this.context!.createGain();
      volume.gain.value = 0;
      const panner = this.context!.createStereoPanner();
      source.connect(volume);
      volume.connect(panner);
      panner.connect(this.master!);
      source.start();
      this.crowd = { source, volume, panner };
    }
    if (!this.crowd) return;
    const t = this.context!.currentTime;
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

  playSample(key: string) {
    const variants = this.sampleBuffers.get(key)!;
    const index = this.sampleIndices.get(key) ?? 0;
    this.sampleIndices.set(key, (index + 1) % variants.length);
    const source = this.context!.createBufferSource();
    source.buffer = variants[index];
    const gain = this.context!.createGain();
    gain.gain.value = SFX_CUES[key].gain;
    source.connect(gain);
    gain.connect(this.master!);
    const voice: SampleVoice = { key, source, gain };
    this.sampleVoices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.sampleVoices.delete(voice);
    };
    source.start();
    return voice;
  }

  announce(key: string, priority: number) {
    // Latest inventory replaces older inventory. Lap calls take precedence;
    // countdown takes precedence over both. Nothing waits in a stale queue.
    for (const voice of this.sampleVoices)
      if (voice.announcementPriority! > priority) return;
    for (const voice of this.sampleVoices)
      if (voice.announcementPriority !== undefined) this.stopSamples(voice.key);
    this.playSample(key).announcementPriority = priority;
  }

  stopSamples(key?: string) {
    for (const voice of this.sampleVoices) {
      if (key !== undefined && voice.key !== key) continue;
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
      this.sampleVoices.delete(voice);
    }
  }

  build() {
    const ctx = this.context!;
    this.master = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.16;
    this.master.connect(this.compressor);
    // Menu feedback remains audible while race effects are paused.
    this.menuBus = ctx.createGain();
    this.menuBus.connect(this.compressor);
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

  menuCue(kind: MenuSound) {
    // Resume stays synchronous in the original gesture; decode each sample once.
    this.start().catch((error) => console.error("Menu audio:", error));
    const ctx = this.context!;
    const sequence = ++this.menuSequence;
    if (this.muted || this.hidden || this.volume === 0) return;
    const play = () => {
      if (sequence === this.menuSequence && ctx.state === "running")
        this.playMenuCue(kind);
    };
    if (ctx.state === "running" && this.menuBuffers.size === 3) play();
    else if (ctx.state === "running")
      this.menuReady!.then(play).catch((error) =>
        console.error("Menu audio:", error),
      );
    else if (navigator.userActivation.isActive)
      Promise.all([ctx.resume(), this.menuReady])
        .then(play)
        .catch((error) => console.error("Menu audio:", error));
    // Controller polling is not an autoplay gesture. Never queue suspended cues.
    // During initial decoding, retain only the latest action, not a late burst.
  }

  playMenuCue(kind: MenuSound) {
    if (this.muted || this.hidden || this.volume === 0) return;
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.menuBuffers.get(kind)!;
    source.connect(this.menuBus);
    this.menuVoices.add(source);
    source.onended = () => {
      source.disconnect();
      this.menuVoices.delete(source);
    };
    source.start();
  }

  launchCue(stage: number) {
    this.announce(`voice:${stage}`, 3);
  }

  loopBed(buffer: AudioBuffer, type: BiquadFilterType, frequency: number) {
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.55;
    const gain = this.context!.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
    this.sources.push(source);
    return { source, gain, filter };
  }

  loopNoise(type: BiquadFilterType, frequency: number, q: number) {
    const source = this.context!.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.context!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context!.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
    this.sources.push(source);
    return { source, gain, filter };
  }

  update(
    speedNormalized: number,
    boost: number,
    controls: EngineControls = {},
  ) {
    if (!this.started) return;
    const t = this.context!.currentTime;
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
    const target = (param: AudioParam, value: number, smoothing = 0.1) =>
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
    const t = this.context!.currentTime;
    for (const loop of [
      this.motor,
      this.turbine,
      this.wind,
      this.brake,
      this.boost,
    ])
      loop.gain.gain.setTargetAtTime(0, t, 0.025);
  }

  raceEvent(event: AudioRaceEvent, race: AudioRace, lapCount: number) {
    if (event.kind === "finish") {
      if (!race.finished || this.announcedResults.has(race)) return;
      this.announcedResults.add(race);
      this.effect(
        "finish",
        race.player.eliminated ? "eliminated" : race.position,
      );
    } else if (event.kind === "lap") {
      if (!race.finished)
        this.effect(
          "lap",
          race.player.lap === lapCount ? "final" : race.player.lap,
        );
    } else this.effect(event.kind, event.text);
  }

  effect(kind: string, weapon: string | number = "") {
    if (kind === "critical-clear") {
      this.stopSamples("critical");
      return;
    }
    if (!this.started || this.muted || this.paused || this.hidden) return;
    const now = this.context!.currentTime;
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
    const key =
      kind === "fire" ? `fire:${(weapon as string).toUpperCase()}` : kind;
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
    if (this.muted || this.hidden || this.volume === 0) this.menuSequence++;
    // Fixed -6.02 dB trim for menu feedback; the user's effects setting is unchanged.
    this.menuBus.gain.setValueAtTime(
      this.muted || this.hidden ? 0 : this.volume * 0.5,
      this.context!.currentTime,
    );
    this.master.gain.setTargetAtTime(
      this.muted || this.paused || this.hidden ? 0 : this.volume,
      this.context!.currentTime,
      0.015,
    );
  }

  setMuted(muted: boolean) {
    this.muted = Boolean(muted);
    this.applyVolume();
  }

  setPaused(paused: boolean) {
    this.paused = Boolean(paused);
    this.applyVolume();
  }

  setVolume(volume: number) {
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
    for (const voice of this.menuVoices) voice.stop();
    this.sources.forEach((source) => {
      source.stop();
      source.disconnect();
    });
    await this.context!.close();
    this.context = null;
    this.master = null;
    this.sources = [];
    this.lastEffect.clear();
    this.sampleBuffers.clear();
    this.menuBuffers.clear();
    this.menuReady = null;
    this.menuSequence++;
    this.crowdBuffer = null;
    this.sampleIndices.clear();
    this.ready = null;
    this.started = false;
  }
}
