const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engineOscillator = null;
    this.engineHarmonic = null;
    this.muted = false;
    this.started = false;
  }

  async start() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.context.destination);

      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.master);

      this.engineOscillator = this.context.createOscillator();
      this.engineOscillator.type = "sawtooth";
      this.engineOscillator.frequency.value = 70;
      this.engineOscillator.connect(this.engineGain);
      this.engineOscillator.start();

      this.engineHarmonic = this.context.createOscillator();
      this.engineHarmonic.type = "triangle";
      this.engineHarmonic.frequency.value = 140;
      const harmonicGain = this.context.createGain();
      harmonicGain.gain.value = 0.22;
      this.engineHarmonic.connect(harmonicGain);
      harmonicGain.connect(this.engineGain);
      this.engineHarmonic.start();
      this.started = true;
    }
    await this.context.resume();
  }

  update(speedNormalized, boosting) {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    const speed = clamp(speedNormalized, 0, 1);
    this.engineOscillator.frequency.setTargetAtTime(
      55 + speed * 115 + (boosting ? 45 : 0),
      now,
      0.08,
    );
    this.engineHarmonic.frequency.setTargetAtTime(
      110 + speed * 230 + (boosting ? 90 : 0),
      now,
      0.08,
    );
    this.engineGain.gain.setTargetAtTime(
      0.035 + speed * 0.11 + (boosting ? 0.035 : 0),
      now,
      0.1,
    );
  }

  effect(kind) {
    if (!this.context || !this.started || this.muted) return;
    const sounds = {
      pickup: {
        frequency: 660,
        endFrequency: 1180,
        duration: 0.16,
        type: "sine",
        volume: 0.16,
      },
      fire: {
        frequency: 420,
        endFrequency: 120,
        duration: 0.22,
        type: "sawtooth",
        volume: 0.13,
      },
      hit: {
        frequency: 180,
        endFrequency: 48,
        duration: 0.28,
        type: "triangle",
        volume: 0.2,
      },
      countdown: {
        frequency: 520,
        endFrequency: 520,
        duration: 0.11,
        type: "square",
        volume: 0.09,
      },
    };
    const sound = sounds[kind];
    if (!sound) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = sound.type;
    oscillator.frequency.setValueAtTime(sound.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      sound.endFrequency,
      now + sound.duration,
    );
    gain.gain.setValueAtTime(sound.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + sound.duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + sound.duration);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.22,
        this.context.currentTime,
        0.025,
      );
    }
  }

  async dispose() {
    if (!this.context) return;
    this.engineOscillator.stop();
    this.engineHarmonic.stop();
    this.engineOscillator.disconnect();
    this.engineHarmonic.disconnect();
    this.engineGain.disconnect();
    this.master.disconnect();
    await this.context.close();
    this.context = null;
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
