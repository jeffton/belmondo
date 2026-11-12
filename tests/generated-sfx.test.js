import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AudioEngine } from "../src/audio.js";
import { SFX_CUES } from "../src/generated-sfx.js";

globalThis.window = undefined;
globalThis.document = undefined;

class Node {
  constructor() {
    this.gain = {
      value: 0,
      setTargetAtTime(value) {
        this.value = value;
      },
    };
    this.connected = false;
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}

class Context {
  constructor() {
    this.currentTime = 1;
    this.sources = [];
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createGain() {
    return new Node();
  }
  createStereoPanner() {
    const panner = new Node();
    panner.pan = {
      value: 0,
      setTargetAtTime(value) {
        this.value = value;
      },
    };
    return panner;
  }
  async decodeAudioData(bytes) {
    return { bytes, duration: 1 };
  }
  createBufferSource() {
    const source = new Node();
    source.start = () => {
      source.playing = true;
    };
    source.stop = () => {
      source.playing = false;
    };
    this.sources.push(source);
    return source;
  }
}

class Engine extends AudioEngine {
  build() {
    this.master = this.context.createGain();
  }
}

function environment() {
  const window = new EventTarget();
  window.AudioContext = Context;
  const document = new EventTarget();
  document.hidden = false;
  return { window, document };
}

test("generated pack decodes once and preserves event and lifecycle boundaries", async (t) => {
  const env = environment();
  t.mock.method(globalThis, "fetch", async (url) => {
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    return new Response(bytes);
  });
  t.mock.property(globalThis, "window", env.window);
  t.mock.property(globalThis, "document", env.document);
  const audio = new Engine();
  await audio.start();
  const loads = globalThis.fetch.mock.callCount();
  assert.equal(
    loads,
    Object.values(SFX_CUES).reduce((n, cue) => n + cue.files.length, 1),
  );
  await audio.start();
  assert.equal(globalThis.fetch.mock.callCount(), loads);

  audio.effect("voice:3");
  const spoken = [...audio.sampleVoices][0];
  assert.equal(spoken.gain.gain.value, 0.9);
  audio.setPaused(true);
  assert.equal(spoken.source.playing, false);
  audio.setPaused(false);
  assert.equal(audio.sampleVoices.size, 0, "speech never replays on resume");
  audio.effect("voice:2");
  audio.setMuted(true);
  assert.equal(audio.sampleVoices.size, 0);
  audio.effect("voice:1");
  assert.equal(audio.sampleVoices.size, 0);
  audio.setMuted(false);

  audio.effect("fire", "MISSILE");
  const first = [...audio.sampleVoices][0];
  audio.effect("fire", "MISSILE");
  const second = [...audio.sampleVoices][1];
  assert.notEqual(
    first.source.buffer,
    second.source.buffer,
    "consecutive shots use distinct variants",
  );
  audio.setVolume(0.35);
  assert.equal(audio.master.gain.value, 0.35);
  for (const voice of audio.sampleVoices) assert(voice.gain.connected);
  audio.setPaused(true);
  assert.equal(audio.sampleVoices.size, 0);
  assert.equal(first.source.playing, false);
  assert.equal(first.gain.connected, false);
  audio.effect("lap");
  assert.equal(audio.sampleVoices.size, 0);
  audio.setPaused(false);
  assert.equal(audio.sampleVoices.size, 0, "resume cannot replay stale tails");

  audio.effect("lap");
  audio.effect("finish");
  assert.deepEqual(
    [...audio.sampleVoices].map((voice) => voice.key),
    ["finish"],
  );
  env.window.dispatchEvent(new Event("blur"));
  assert.equal(audio.sampleVoices.size, 0);
  audio.effect("pickup");
  assert.equal(audio.sampleVoices.size, 0);
  env.window.dispatchEvent(new Event("focus"));
  audio.effect("pickup");
  audio.setMuted(true);
  assert.equal(audio.sampleVoices.size, 0);
  audio.setMuted(false);
  audio.effect("incoming");
  env.document.hidden = true;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(audio.sampleVoices.size, 0);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event("visibilitychange"));
  audio.effect("hit");
  const hitCount = audio.sampleVoices.size;
  audio.effect("hit");
  assert.equal(
    audio.sampleVoices.size,
    hitCount,
    "existing collision cooldown remains",
  );
  audio.updateCrowd({ gain: 0.4, pan: -0.3 });
  const crowd = audio.crowd;
  assert(crowd.source.loop);
  assert.equal(crowd.volume.gain.value, 0.4);
  assert.equal(crowd.panner.pan.value, -0.3);
  audio.updateCrowd({ gain: 0, pan: 0 });
  audio.updateCrowd({ gain: 0.35, pan: 0.2 });
  assert.equal(
    audio.crowd.source,
    crowd.source,
    "passing a lap seam never retriggers the loop",
  );
  audio.setPaused(true);
  assert.equal(audio.master.gain.value, 0);
  audio.updateCrowd({ gain: 0.5, pan: 0 });
  assert.equal(
    crowd.volume.gain.value,
    0.35,
    "paused updates cannot alter the mix",
  );
  audio.stopCrowd();
  assert.equal(audio.crowd, null);
  assert.equal(crowd.source.playing, false);
  assert.equal(crowd.panner.connected, false);
  audio.setPaused(false);
  audio.updateCrowd({ gain: 0.3, pan: 0 });
  assert.notEqual(
    audio.crowd.source,
    crowd.source,
    "a new race gets one fresh loop",
  );
  const context = audio.context;
  await audio.dispose();
  assert(
    context.sources.every((source) => !source.playing && !source.connected),
  );
  assert.equal(audio.sampleBuffers.size, 0);
  assert.equal(audio.context, null);
});

test("missing generated asset rejects startup rather than synthesizing a substitute", async (t) => {
  const env = environment();
  t.mock.property(globalThis, "window", env.window);
  t.mock.property(globalThis, "document", env.document);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("missing", { status: 404 }),
  );
  const audio = new Engine();
  await assert.rejects(audio.start(), /Sound effect .* HTTP 404/);
  await audio.dispose();
});

test("every replacement category has distinct decodable PCM masters", async () => {
  assert.deepEqual(
    Object.keys(SFX_CUES).sort(),
    [
      "fire:MISSILE",
      "fire:PULSE",
      "fire:MINE",
      "fire:SHIELD",
      "fire:TURBO",
      "boost",
      "pickup",
      "hit",
      "scrape",
      "jump",
      "land",
      "incoming",
      "lap",
      "finish",
      "voice:3",
      "voice:2",
      "voice:1",
      "voice:0",
    ].sort(),
  );
  for (const cue of Object.values(SFX_CUES)) {
    assert.equal(new Set(cue.files).size, cue.files.length);
    for (const url of cue.files) {
      const wav = await readFile(new URL(`../public${url}`, import.meta.url));
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.equal(wav.toString("ascii", 8, 12), "WAVE");
      assert(wav.length > 44);
    }
  }
});
