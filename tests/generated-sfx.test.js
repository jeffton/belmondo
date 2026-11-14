import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AudioEngine } from "../src/audio.js";
import { SFX_CUES } from "../src/generated-sfx.js";
import { Race, LAPS_BY_CLASS } from "../src/race.js";
import { makeTrack, TRACK_INDEX } from "../src/track.js";

globalThis.window = undefined;
const LAPS = LAPS_BY_CLASS[2];
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

  for (const stage of [3, 2, 1, 0]) {
    const sourceCount = audio.context.sources.length;
    audio.effect(stage === 0 ? "go" : "countdown", stage);
    const voices = [...audio.sampleVoices];
    assert.equal(voices.length, 1, "one spoken word per signal crossing");
    assert.equal(voices[0].key, `voice:${stage}`);
    assert.equal(
      audio.context.sources.length,
      sourceCount + 1,
      "no layered countdown tone or start chord",
    );
    audio.stopSamples();
  }
  const active = () => [...audio.sampleVoices].map((voice) => voice.key);
  for (const weapon of ["MISSILE", "PULSE", "MINE", "SHIELD", "TURBO"]) {
    const sourceCount = audio.context.sources.length;
    audio.effect("pickup", weapon);
    assert.deepEqual(active(), [`voice:${weapon}`]);
    assert.equal(audio.context.sources.length, sourceCount + 1);
  }
  audio.effect("lap", 2);
  assert.deepEqual(
    active(),
    ["voice:lap:2"],
    "lap interrupts inventory speech",
  );
  audio.effect("pickup", "MISSILE");
  assert.deepEqual(active(), ["voice:lap:2"], "lap has priority over pickup");
  audio.effect("countdown", 3);
  assert.deepEqual(active(), ["voice:3"], "start signal has highest priority");
  audio.effect("lap", 3);
  assert.deepEqual(active(), ["voice:3"]);
  const completed = [...audio.sampleVoices][0].source;
  completed.stop();
  completed.onended();
  audio.effect("lap", 4);
  assert.deepEqual(
    active(),
    ["voice:lap:4"],
    "completed speech releases priority",
  );
  audio.effect("lap", "final");
  assert.deepEqual(
    active(),
    ["voice:lap:final"],
    "final lap replaces numbered lap",
  );
  audio.setPaused(true);
  audio.setPaused(false);
  assert.deepEqual(
    active(),
    [],
    "pause discards announcements with no stale queue",
  );

  for (let rank = 1; rank <= 8; rank++) {
    audio.effect("finish", rank);
    assert.deepEqual(active(), [`voice:result:${rank}`]);
    audio.effect("countdown", 3);
    audio.effect("lap", "final");
    audio.effect("pickup", "MISSILE");
    assert.deepEqual(
      active(),
      [`voice:result:${rank}`],
      "finish has highest priority",
    );
  }
  audio.stopSamples();

  const beforeWarning = audio.context.sources.length;
  audio.raceEvent({ kind: "critical", text: "SHIELD CRITICAL" }, {}, LAPS);
  const warning = [...audio.sampleVoices][0];
  assert.equal(warning.key, "critical");
  assert.equal(
    warning.source.loop,
    undefined,
    "warning is one-shot, not an alarm loop",
  );
  audio.raceEvent({ kind: "critical-clear", text: "" }, {}, LAPS);
  assert.equal(warning.source.playing, false);
  assert.deepEqual(
    active(),
    [],
    "healing/terminal clear cancels active warning",
  );
  assert.equal(
    audio.context.sources.length,
    beforeWarning + 1,
    "clear never starts audio",
  );
  audio.raceEvent({ kind: "critical", text: "SHIELD CRITICAL" }, {}, LAPS);
  assert.deepEqual(active(), ["critical"], "a subsequent entry can warn again");
  audio.setPaused(true);
  audio.setPaused(false);
  assert.deepEqual(
    active(),
    [],
    "pause discards warning, with no delayed restart",
  );
  audio.setMuted(true);
  audio.raceEvent({ kind: "critical", text: "SHIELD CRITICAL" }, {}, LAPS);
  audio.raceEvent({ kind: "critical-clear", text: "" }, {}, LAPS);
  assert.deepEqual(active(), []);
  audio.setMuted(false);

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
  audio.effect("lap", 2);
  assert.equal(audio.sampleVoices.size, 0);
  audio.setPaused(false);
  assert.equal(audio.sampleVoices.size, 0, "resume cannot replay stale tails");

  audio.effect("lap", 2);
  audio.effect("finish", 1);
  assert.deepEqual(
    [...audio.sampleVoices].map((voice) => voice.key),
    ["voice:result:1"],
  );
  env.window.dispatchEvent(new Event("blur"));
  assert.equal(audio.sampleVoices.size, 0);
  audio.effect("pickup", "MISSILE");
  assert.equal(audio.sampleVoices.size, 0);
  env.window.dispatchEvent(new Event("focus"));
  audio.effect("pickup", "MISSILE");
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

test("spoken lap entry follows earned player gates, including final lap and finish", async (t) => {
  const env = environment();
  t.mock.property(globalThis, "window", env.window);
  t.mock.property(globalThis, "document", env.document);
  t.mock.method(
    globalThis,
    "fetch",
    async (url) =>
      new Response(await readFile(new URL(`../public${url}`, import.meta.url))),
  );
  const audio = new Engine();
  await audio.start();
  const track = makeTrack(TRACK_INDEX.COAST);
  const placeBeforeGate = (racer, lap) => {
    const s = track.finishS + lap * track.length - 1;
    const frame = track.frame(s);
    racer.lap = lap;
    racer.s = racer.contactS = s;
    racer.gate = lap * 32;
    racer.checkpoint = { s, branch: 0, gate: racer.gate };
    racer.position.copy(frame.p);
    racer.position.y += 2.2;
    racer.velocity.copy(frame.tangent).multiplyScalar(50);
    racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  };
  for (const [speedClass, lapCount] of LAPS_BY_CLASS.entries()) {
    for (let lap = 1; lap <= lapCount; lap++) {
      const race = new Race(track, 0, "trial", speedClass);
      race.countdown = 0;
      const player = race.player;
      placeBeforeGate(player, lap);
      assert.equal(race.events.length, 0, "no pre-crossing announcement");
      for (let step = 0; step < 120 && player.lap === lap; step++)
        race.update(1 / 120, {});
      assert.equal(player.lap, lap + 1);
      for (const event of race.events)
        audio.raceEvent(event, race, race.lapCount);
      const spoken = [...audio.sampleVoices].filter(
        (voice) => voice.announcementPriority !== undefined,
      );
      if (lap === race.lapCount) {
        assert.deepEqual(
          spoken.map((voice) => voice.key),
          ["voice:result:1"],
          "finish replaces lap speech without repeating final lap",
        );
        assert(
          [...audio.sampleVoices].some(
            (voice) => voice.key === "voice:result:1",
          ),
        );
      } else {
        assert.deepEqual(
          spoken.map((voice) => voice.key),
          [
            lap + 1 === race.lapCount
              ? "voice:lap:final"
              : `voice:lap:${lap + 1}`,
          ],
        );
      }
      audio.stopSamples();
    }
  }
  const aiRace = new Race(track);
  aiRace.countdown = 0;
  placeBeforeGate(aiRace.racers[1], 1);
  for (let step = 0; step < 120 && aiRace.racers[1].lap === 1; step++)
    aiRace.update(1 / 120, {});
  assert.equal(aiRace.racers[1].lap, 2);
  assert(
    !aiRace.events.some((event) => event.kind === "lap"),
    "AI laps never announce",
  );
  await audio.dispose();
});

test("real jump and landing retain simulation events without event audio", async (t) => {
  const env = environment();
  t.mock.property(globalThis, "window", env.window);
  t.mock.property(globalThis, "document", env.document);
  t.mock.method(
    globalThis,
    "fetch",
    async (url) =>
      new Response(await readFile(new URL(`../public${url}`, import.meta.url))),
  );
  const audio = new Engine();
  await audio.start();
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track, 1, "trial");
  race.countdown = 0;
  const player = race.player;
  const s = (track.config.jump - 0.01) * track.length;
  const frame = track.frame(s);
  player.position.copy(frame.p);
  player.position.y += 2.2;
  player.velocity.copy(frame.tangent).multiplyScalar(160);
  player.s = player.contactS = s;
  player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  player.gate = Math.floor((s / track.length) * 32) + 1;
  const seen = new Set();
  for (let step = 0; step < 360 && !seen.has("land"); step++) {
    race.update(1 / 120, { throttle: true, steer: 0, air: 0, brake: false });
    for (const event of race.events) {
      if (event.kind !== "jump" && event.kind !== "land") continue;
      seen.add(event.kind);
      const sourceCount = audio.context.sources.length;
      audio.raceEvent(event, race, race.lapCount);
      assert.equal(audio.context.sources.length, sourceCount);
      assert.equal(audio.sampleVoices.size, 0);
    }
    race.events.length = 0;
  }
  assert.deepEqual([...seen], ["jump", "land"]);
  assert(player.grounded);
  assert.equal(player.shield, 100);
  audio.effect("fire", "MISSILE");
  audio.effect("hit");
  audio.effect("boost");
  assert.deepEqual(
    [...audio.sampleVoices].map((voice) => voice.key),
    ["fire:MISSILE", "hit", "boost"],
  );
  await audio.dispose();
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
      "hit",
      "critical",
      "scrape",
      "incoming",
      "voice:result:1",
      "voice:result:2",
      "voice:result:3",
      "voice:result:4",
      "voice:result:5",
      "voice:result:6",
      "voice:result:7",
      "voice:result:8",
      "voice:result:eliminated",
      "voice:3",
      "voice:2",
      "voice:1",
      "voice:0",
      "voice:lap:2",
      "voice:lap:3",
      "voice:lap:4",
      "voice:lap:final",
      "voice:MISSILE",
      "voice:PULSE",
      "voice:MINE",
      "voice:SHIELD",
      "voice:TURBO",
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
