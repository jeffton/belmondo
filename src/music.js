import { createShuffleBag } from "./soundtrack.js";

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
    this._volume = Math.max(0, Math.min(1, Number(value)));
    this.audio.volume = this._volume;
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
  }

  #selectCurrent() {
    if (!this.current) return;
    this.audio.src = this.current.url;
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
