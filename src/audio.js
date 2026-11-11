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
      await unlocked;
    } else {
      await this.context.resume();
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
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = "lowpass";
    this.motorFilter.frequency.value = 500;
    this.motorFilter.Q.value = 0.7;
    this.motorFilter.connect(this.master);
    this.motor = this.loopTone("sawtooth", 64, 0, this.motorFilter);
    this.turbine = this.loopTone("triangle", 129, 0, this.motorFilter);
    this.sub = this.loopTone("sine", 44, 0, this.master);
    this.wind = this.loopNoise("lowpass", 900, 0.6);
    this.brake = this.loopNoise("bandpass", 2200, 1.2);
    this.boost = this.loopNoise("bandpass", 800, 0.7);
  }

  loopTone(type, frequency, volume, output) {
    const source = this.context.createOscillator();
    source.type = type;
    source.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(output);
    source.start();
    this.sources.push(source);
    return { source, gain };
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

  update(speedNormalized, boosting, controls = {}) {
    if (!this.started) return;
    const t = this.context.currentTime;
    const speed = clamp(speedNormalized, 0, 1.4);
    const air = Math.abs(controls.air || 0);
    const boost = boosting ? 1 : 0;
    const target = (param, value, smoothing = 0.06) =>
      param.setTargetAtTime(value, t, smoothing);
    // A low hover core, detuned turbine and filtered air provide speed without
    // the piercing constant sawtooth of an unfiltered synth engine.
    target(this.motor.source.frequency, 62 + speed * 105 + boost * 38);
    target(this.turbine.source.frequency, 127 + speed * 211 + boost * 77);
    target(this.sub.source.frequency, 43 + speed * 28);
    target(this.motor.gain.gain, 0.075 + speed * 0.1);
    target(this.turbine.gain.gain, 0.045 + speed * 0.045);
    target(this.sub.gain.gain, 0.1 + speed * 0.025);
    target(this.motorFilter.frequency, 320 + speed * 1400 + boost * 800);
    target(this.wind.gain.gain, speed * speed * 0.16);
    target(this.wind.filter.frequency, 650 + speed * 1600);
    target(this.brake.gain.gain, air * (0.08 + speed * 0.24), 0.025);
    target(this.brake.filter.frequency, 1100 + speed * 2100);
    target(this.boost.gain.gain, boost * 0.25, 0.035);
    target(this.boost.filter.frequency, 800 + speed * 1300);
  }

  stopEngine() {
    if (!this.started) return;
    const t = this.context.currentTime;
    for (const loop of [
      this.motor,
      this.turbine,
      this.sub,
      this.wind,
      this.brake,
      this.boost,
    ])
      loop.gain.gain.setTargetAtTime(0, t, 0.025);
  }

  tone(frequency, endFrequency, duration, volume, type = "sine", delay = 0) {
    const ctx = this.context;
    const t = ctx.currentTime + delay;
    const source = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    source.type = type;
    source.frequency.setValueAtTime(frequency, t);
    source.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    source.connect(filter);
    this.transient(source, filter, t, duration, volume);
  }

  noiseBurst(frequency, endFrequency, duration, volume, delay = 0) {
    const ctx = this.context;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    source.connect(filter);
    this.transient(source, filter, t, duration, volume);
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
    switch (kind) {
      case "countdown":
        this.tone(780, 780, 0.13, 0.38, "square");
        break;
      case "go":
        this.tone(1175, 1568, 0.38, 0.28, "triangle");
        break;
      case "pickup":
        [880, 1175, 1760].forEach((f, i) =>
          this.tone(f, f, 0.12, 0.22, "sine", i * 0.055),
        );
        break;
      case "fire":
        switch (weapon.toUpperCase()) {
          case "SHIELD":
            this.tone(220, 880, 0.5, 0.3, "triangle");
            this.tone(330, 1320, 0.5, 0.16, "sine");
            break;
          case "SURGE":
            this.effect("boost");
            break;
          case "MINE":
            this.tone(580, 140, 0.16, 0.35, "square");
            this.tone(180, 100, 0.18, 0.25, "triangle", 0.1);
            break;
          case "PULSE":
            [0, 0.07, 0.14].forEach((delay) => {
              this.tone(900, 110, 0.12, 0.3, "sawtooth", delay);
              this.noiseBurst(3200, 700, 0.1, 0.24, delay);
            });
            break;
          default: // Missile launch: ignition crack, then rising exhaust.
            this.noiseBurst(600, 2600, 0.5, 0.65);
            this.tone(110, 380, 0.35, 0.24, "sawtooth");
        }
        break;
      case "hit":
        this.noiseBurst(2200, 150, 0.32, 0.85);
        this.tone(150, 38, 0.32, 0.48, "triangle");
        break;
      case "scrape":
        this.noiseBurst(3600, 900, 0.19, 0.48);
        this.tone(1600, 410, 0.09, 0.11, "sawtooth");
        break;
      case "boost":
        this.noiseBurst(350, 3200, 0.55, 0.6);
        this.tone(120, 540, 0.4, 0.22, "triangle");
        break;
      case "jump":
        this.noiseBurst(1400, 450, 0.27, 0.22);
        break;
      case "land":
        this.noiseBurst(750, 160, 0.19, 0.4);
        this.tone(96, 40, 0.22, 0.35, "sine");
        break;
      case "incoming":
        [0, 0.17].forEach((delay) =>
          this.tone(1100, 850, 0.1, 0.23, "square", delay),
        );
        break;
      case "lap":
      case "finish":
        [587, 784, 1175].forEach((f, i) =>
          this.tone(f, f, 0.28, 0.22, "triangle", i * 0.12),
        );
        break;
    }
  }

  applyVolume() {
    if (!this.master) return;
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
    this.sources.forEach((source) => {
      source.stop();
      source.disconnect();
    });
    await this.context.close();
    this.context = null;
    this.master = null;
    this.sources = [];
    this.lastEffect.clear();
    this.started = false;
  }
}

export class MusicPlayer {
  constructor(onChange = () => {}) {
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.addEventListener("ended", () => this.next());
    this.audio.addEventListener("play", () => this.#emit());
    this.audio.addEventListener("pause", () => this.#emit());
    this.audio.addEventListener("error", () => {
      this.error = `Could not play ${this.current?.name ?? "this audio file"}.`;
      this.#emit();
    });
    this.files = [];
    this.index = 0;
    this.urls = [];
    this.error = null;
    this.onChange = onChange;
    this._volume = 1;
    this.playRequest = 0;
  }

  get volume() {
    return this._volume;
  }

  set volume(value) {
    this._volume = clamp(Number(value), 0, 1);
    this.audio.volume = this._volume;
  }

  get current() {
    return this.files[this.index] ?? null;
  }

  async loadFiles(files) {
    this.playRequest++;
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.urls.forEach(URL.revokeObjectURL);
    this.urls = [];
    this.files = Array.from(files).filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name),
    );
    this.urls = this.files.map((file) => URL.createObjectURL(file));
    this.index = 0;
    this.error = this.files.length
      ? null
      : "No supported audio files were found.";
    this.#selectCurrent();
    this.#emit();
  }

  async play() {
    if (!this.current) {
      this.error = "Load audio files before pressing play.";
      this.#emit();
      return;
    }
    const request = ++this.playRequest;
    this.error = null;
    try {
      await this.audio.play();
    } catch (error) {
      if (request !== this.playRequest) return;
      this.error = error.message || "Playback was blocked by the browser.";
      this.#emit();
    }
  }

  pause() {
    this.playRequest++;
    this.audio.pause();
  }

  async next() {
    if (!this.files.length) return;
    this.index = (this.index + 1) % this.files.length;
    this.error = null;
    this.#selectCurrent();
    this.#emit();
    await this.play();
  }

  dispose() {
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.urls.forEach(URL.revokeObjectURL);
    this.urls = [];
    this.files = [];
    this.index = 0;
    this.error = null;
    this.#emit();
  }

  #selectCurrent() {
    if (!this.current) return;
    this.audio.src = this.urls[this.index];
    this.audio.volume = this._volume;
  }

  #emit() {
    this.onChange({
      name: this.current?.name ?? null,
      count: this.files.length,
      playing: !this.audio.paused,
      error: this.error,
    });
  }
}
