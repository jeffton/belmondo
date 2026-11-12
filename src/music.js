import { createShuffleBag } from "./soundtrack.js";

export class MusicPlayer {
  constructor(onChange = () => {}) {
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.context = null;
    this.inTunnel = false;
    this.inMenu = false;
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
    this._volume = Math.max(0, Math.min(1, Number(value)));
    if (this.context) this.#setOutput(!this.audio.paused);
  }

  get current() {
    return this.files[this.index] ?? null;
  }

  async loadFiles(files) {
    const tracks = Array.from(files)
      .filter(
        (file) =>
          file.type.startsWith("audio/") ||
          /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name),
      )
      .map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    this.loadTracks(tracks);
    this.urls = tracks.map((track) => track.url);
  }

  loadTracks(tracks, { shuffle = false } = {}) {
    this.playRequest++;
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.urls.forEach(URL.revokeObjectURL);
    this.urls = [];
    this.files = tracks;
    this.shuffleBag = shuffle ? createShuffleBag(tracks.length) : null;
    this.index = this.shuffleBag ? this.shuffleBag.next().value : 0;
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
      this.#ensureGraph();
      // Both calls remain in the original gesture: do not await resume first.
      const unlocked = this.context.resume();
      this.#setOutput(true);
      await Promise.all([unlocked, this.audio.play()]);
    } catch (error) {
      if (request !== this.playRequest) return;
      if (this.context) this.#setOutput(false);
      this.error = error.message || "Playback was blocked by the browser.";
      this.#emit();
    }
  }

  pause() {
    this.playRequest++;
    this.audio.pause();
    if (this.context) this.#setOutput(false);
  }

  async next() {
    if (!this.files.length) return;
    this.index = this.shuffleBag
      ? this.shuffleBag.next().value
      : (this.index + 1) % this.files.length;
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
    if (this.context) {
      this.source.disconnect();
      this.echoNodes.forEach((node) => node.disconnect());
      this.output.disconnect();
      this.sceneGain.disconnect();
      const context = this.context;
      this.context = null;
      return context.close();
    }
  }

  setTunnel(inside) {
    if (this.inTunnel === inside) return;
    this.inTunnel = inside;
    if (this.context) this.#setEcho();
  }

  setMenu(inside) {
    if (this.inMenu === inside) return;
    this.inMenu = inside;
    if (this.context) this.#ramp(this.sceneGain.gain, inside ? 0.35 : 1, 0.35);
  }

  #ensureGraph() {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    this.context = new Context();
    this.source = this.context.createMediaElementSource(this.audio);
    this.output = this.context.createGain();
    this.output.gain.value = 0;
    this.source.connect(this.output); // Dry signal is never filtered.
    this.sceneGain = this.context.createGain();
    this.sceneGain.gain.value = this.inMenu ? 0.35 : 1;
    this.output.connect(this.sceneGain);
    this.sceneGain.connect(this.context.destination);
    this.#buildEcho();
  }

  #buildEcho() {
    this.echoNodes?.forEach((node) => node.disconnect());
    const ctx = this.context;
    this.send = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 2300;
    this.filter.Q.value = 0.5;
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.145;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.25;
    this.wet = ctx.createGain();
    this.send.gain.value = 0;
    this.wet.gain.value = 0;
    this.source.connect(this.send);
    this.send.connect(this.filter);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.filter);
    this.delay.connect(this.wet);
    this.wet.connect(this.output);
    this.echoNodes = [
      this.send,
      this.filter,
      this.delay,
      this.feedback,
      this.wet,
    ];
    this.#setEcho();
  }

  #ramp(param, value, seconds) {
    const now = this.context.currentTime;
    param.cancelAndHoldAtTime(now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  #setEcho() {
    this.#ramp(this.send.gain, this.inTunnel ? 1 : 0, 0.2);
    this.#ramp(this.wet.gain, this.inTunnel ? 0.11 : 0, 0.2);
  }

  #setOutput(playing) {
    this.#ramp(this.output.gain, playing ? this._volume : 0, 0.012);
  }

  #selectCurrent() {
    if (!this.current) return;
    this.audio.src = this.current.url;
    if (this.context) {
      // A skip must not carry the previous recording's echo into the next one.
      this.source.disconnect(this.send);
      this.#buildEcho();
    }
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
