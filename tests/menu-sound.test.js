import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MENU_SOUNDS } from "../src/menu-sound.js";
import { AudioEngine } from "../src/audio.js";

test("generated menu files match the selected source provenance", async () => {
  const provenance = JSON.parse(
    await readFile(
      new URL("../docs/menu-generated-sfx.json", import.meta.url),
      "utf8",
    ),
  );
  for (const asset of provenance.assets) {
    const bytes = await readFile(new URL(`../${asset.file}`, import.meta.url));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
    assert.equal(MENU_SOUNDS[asset.kind].url, asset.file.replace("public", ""));
    assert.equal(MENU_SOUNDS[asset.kind].duration, asset.durationSeconds);
  }
});

function pendingMenu(t, state = "running", activated = false) {
  Object.defineProperty(navigator, "userActivation", {
    value: { isActive: activated },
    configurable: true,
  });
  t.after(() => delete navigator.userActivation);
  const audio = new AudioEngine();
  let resolve;
  audio.menuReady = new Promise((done) => {
    resolve = done;
  });
  audio.context = {
    state,
    currentTime: 0,
    resume() {
      this.state = "running";
      return Promise.resolve();
    },
  };
  audio.master = { gain: { setTargetAtTime() {} } };
  audio.menuBus = { gain: { setValueAtTime() {} } };
  audio.start = () => Promise.resolve();
  const cues = [];
  audio.playMenuCue = (kind) => cues.push(kind);
  return { audio, cues, resolve };
}

test("initial sample decoding retains only the newest input instead of a late cue burst", async (t) => {
  const { audio, cues, resolve } = pendingMenu(t);
  audio.menuCue("move");
  audio.menuCue("confirm");
  assert.deepEqual(cues, []);
  resolve();
  await audio.menuReady;
  assert.deepEqual(cues, ["confirm"]);
});

test("suspended controller input is never replayed when samples finish decoding", async (t) => {
  const { audio, cues, resolve } = pendingMenu(t, "suspended");
  audio.menuCue("move");
  resolve();
  await audio.menuReady;
  assert.deepEqual(cues, []);
});

test("mute during loading cancels a pending cue even if volume is restored", async (t) => {
  const { audio, cues, resolve } = pendingMenu(t);
  audio.menuCue("confirm");
  audio.setVolume(0);
  audio.setVolume(0.8);
  resolve();
  await audio.menuReady;
  assert.deepEqual(cues, []);
});

for (const state of ["muted", "hidden", "zero"]) {
  test(`input while ${state} is never played after decoding and restoration`, async (t) => {
    const { audio, cues, resolve } = pendingMenu(t);
    if (state === "zero") audio.setVolume(0);
    else audio[state] = true;
    audio.menuCue("back");
    audio.muted = false;
    audio.hidden = false;
    audio.setVolume(0.8);
    resolve();
    await audio.menuReady;
    assert.deepEqual(cues, []);
  });
}

test("the first trusted input resumes synchronously and plays its actual sample after decode", async (t) => {
  const { audio, cues, resolve } = pendingMenu(t, "suspended", true);
  audio.menuCue("back");
  assert.equal(audio.context.state, "running");
  resolve();
  await Promise.all([audio.menuReady]);
  await Promise.resolve();
  assert.deepEqual(cues, ["back"]);
});
