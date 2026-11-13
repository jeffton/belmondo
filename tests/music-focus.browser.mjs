import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.musicAudioElements = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.musicAudioElements.push(audio);
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createMediaElementSource(audio) {
        window.musicContext = this;
        return super.createMediaElementSource(audio);
      }
      createGain() {
        const gain = super.createGain();
        if (this === window.musicContext) {
          if (!window.musicOutputGain) window.musicOutputGain = gain;
          else if (!window.musicSceneGain) window.musicSceneGain = gain;
        }
        return gain;
      }
    };
  });
  await page.goto(url);
  await page.bringToFront();
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#start").click();
  await page.waitForFunction(
    () =>
      window.musicAudioElements.at(-1)?.currentSrc.includes("/music/") &&
      !window.musicAudioElements.at(-1).paused &&
      window.musicAudioElements.at(-1).currentTime > 0.2,
  );

  const audioState = () =>
    page.evaluate(() => ({
      src: window.musicAudioElements.at(-1).src,
      time: window.musicAudioElements.at(-1).currentTime,
      paused: window.musicAudioElements.at(-1).paused,
      scene: window.musicSceneGain.gain.value,
    }));
  const hide = async () =>
    page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const show = async () =>
    page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const waitPaused = () =>
    page.waitForFunction(() => window.musicAudioElements.at(-1).paused);
  const waitPlaying = () =>
    page.waitForFunction(() => !window.musicAudioElements.at(-1).paused);
  const assertFrozen = async () => {
    const stopped = await audioState();
    await page.waitForTimeout(250);
    const still = await audioState();
    assert.equal(still.src, stopped.src);
    assert.equal(still.time, stopped.time);
  };
  const assertResumed = async (stopped, expectedGain) => {
    await waitPlaying();
    await page.waitForFunction(
      (time) => window.musicAudioElements.at(-1).currentTime > time + 0.15,
      stopped.time,
    );
    const resumed = await audioState();
    assert.equal(resumed.src, stopped.src);
    assert(resumed.time > stopped.time);
    assert(Math.abs(resumed.scene - expectedGain) < 0.001);
  };

  // Race is automatically paused by visibility loss; music resumes at race level.
  let stopped = await audioState();
  await hide();
  await waitPaused();
  stopped = await audioState();
  await assertFrozen();
  assert.equal(
    await page.evaluate(() => window.nullVector.telemetry.paused),
    true,
  );
  await show();
  await assertResumed(stopped, 0.35);

  // The paused race is a damped music scene; its transport also survives app switching.
  await page.waitForFunction(() => window.nullVector.telemetry.paused);
  await page.waitForFunction(
    () => Math.abs(window.musicSceneGain.gain.value - 0.35) < 0.001,
  );
  stopped = await audioState();
  await hide();
  await waitPaused();
  stopped = await audioState();
  await assertFrozen();
  await show();
  await assertResumed(stopped, 0.35);

  // The main menu uses the same damped gain and preserves exact playlist position.
  await page.locator("#quit").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "menu",
  );
  stopped = await audioState();
  await hide();
  await waitPaused();
  stopped = await audioState();
  await assertFrozen();
  await show();
  await assertResumed(stopped, 0.35);

  // Blur then hide, with focus returning before visibility; reconcile only when active.
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitPaused();
  stopped = await audioState();
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal((await audioState()).paused, true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await assertResumed(stopped, 0.35);

  // Hide then blur, with visibility returning before focus.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event("blur"));
  });
  await waitPaused();
  stopped = await audioState();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal((await audioState()).paused, true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    window.dispatchEvent(new Event("focus"));
  });
  await assertResumed(stopped, 0.35);

  // A user pause remains authoritative across focus/visibility changes.
  await page.locator("#music-open").click();
  await page.locator("#music-play").click();
  await waitPaused();
  const manual = await audioState();
  await hide();
  await show();
  await page.waitForTimeout(250);
  const stillManual = await audioState();
  assert.equal(stillManual.paused, true);
  assert.equal(stillManual.src, manual.src);
  assert.equal(stillManual.time, manual.time);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks: [
          "hidden race pauses and resumes same track/position",
          "pause menu restores playback at 35% gain",
          "main menu restores playback at 35% gain",
          "explicit music pause remains respected",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
