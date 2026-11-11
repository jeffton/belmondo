import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.NativeAudio = NativeAudio;
    window.musicAudioElements = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.musicAudioElements.push(audio);
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createGain() {
        const gain = super.createGain();
        if (!window.effectMasterGain) window.effectMasterGain = gain;
        return gain;
      }
    };
  });

  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#music-open").click();
  const dialog = page.locator("#music-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#music-status")).toContainText("Phase Index");
  await expect(page.locator("#music-status")).toContainText("3 TRACKS");
  await expect(page.locator("#music-default")).toBeVisible();
  await page.locator("#effects-volume").evaluate((element) => {
    element.value = "0.22";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Portrait sound-system UI must not overflow horizontally",
  );
  const soundButtons = page.locator("#music-dialog .file-buttons > *");
  await expect(soundButtons).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(soundButtons.nth(i)).toBeVisible();

  // A real menu gesture starts the default track; exercise actual HTMLMediaElement decoding/playback.
  await page.locator("#music-dialog .close").click();
  await page.locator("#quality").check();
  await page.locator("#start").click();
  await page.waitForFunction(
    () =>
      window.musicAudioElements.some(
        (audio) =>
          audio.currentSrc.includes("phase-index.mp3") &&
          !audio.paused &&
          audio.currentTime > 0.15,
      ),
    {},
    { timeout: 30000 },
  );
  const audioInfo = await page.evaluate(async () => {
    const audio = window.musicAudioElements.at(-1);
    const tracks = ["phase-index", "glass-current", "ion-drift"];
    const decoded = [];
    for (const track of tracks) {
      const probe = new NativeAudio();
      probe.preload = "auto";
      probe.src = `/music/${track}.mp3`;
      await new Promise((resolve, reject) => {
        probe.addEventListener("loadedmetadata", resolve, { once: true });
        probe.addEventListener(
          "error",
          () => reject(new Error(`decode failed: ${track}`)),
          { once: true },
        );
        probe.load();
      });
      decoded.push({
        track,
        duration: probe.duration,
        readyState: probe.readyState,
      });
      probe.src = "";
    }
    return {
      src: audio.currentSrc,
      volume: audio.volume,
      paused: audio.paused,
      currentTime: audio.currentTime,
      decoded,
    };
  });
  assert(
    audioInfo.src.includes("phase-index.mp3"),
    "Race start should play Phase Index",
  );
  assert(
    audioInfo.volume > 0 && audioInfo.volume <= 1,
    "Music should have independent nonzero volume",
  );
  for (const track of audioInfo.decoded) {
    assert(
      track.duration > 30 && Number.isFinite(track.duration),
      `${track.track} must decode with a real duration`,
    );
    assert(track.readyState >= 1, `${track.track} metadata must be decoded`);
  }
  const startedAt = await page.evaluate(
    () => window.musicAudioElements.at(-1).currentTime,
  );
  await page.waitForTimeout(400);
  const advancedTo = await page.evaluate(
    () => window.musicAudioElements.at(-1).currentTime,
  );
  assert(
    advancedTo > startedAt,
    "Native MP3 playback time must advance in the browser",
  );

  // Pause/resume the game without changing an explicit user choice to stop music.
  await page.locator("#pause").click();
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(true);
  await page.locator("#resume").click();
  await page.waitForFunction(() => !window.musicAudioElements.at(-1).paused);
  await page.locator("#pause").click();
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.locator("#pause-music").click();
  await page.locator("#music-play").click();
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(false);
  await page.locator("#music-play").click();
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(true);
  await page.locator("#music-dialog .close").click();
  await page.locator("#resume").click();
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(true);

  // Restore playback, then verify next and native ended→next advancement by seeking to the tail.
  await page.locator("#pause").click();
  await page.locator("#pause-music").click();
  await page.locator("#music-play").click();
  await page.waitForFunction(
    () => window.musicAudioElements.at(-1)?.currentTime > 0.1,
  );
  await page.locator("#music-next").click();
  await page.waitForFunction(
    () =>
      window.musicAudioElements
        .at(-1)
        ?.currentSrc.includes("glass-current.mp3") &&
      !window.musicAudioElements.at(-1).paused,
  );
  await page.waitForFunction(
    () =>
      window.musicAudioElements.at(-1)?.readyState >= 1 &&
      Number.isFinite(window.musicAudioElements.at(-1).duration),
  );
  await page.waitForFunction(
    () => window.musicAudioElements.at(-1)?.currentTime > 0.1,
  );
  await page.evaluate(() => {
    const audio = window.musicAudioElements.at(-1);
    audio.currentTime = audio.duration - 0.2;
  });
  await page.waitForFunction(
    () =>
      window.musicAudioElements.at(-1)?.currentSrc.includes("ion-drift.mp3") &&
      !window.musicAudioElements.at(-1).paused,
    {},
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => window.musicAudioElements.at(-1)?.currentTime > 0.1,
  );
  await page.locator("#music-next").click();
  await page.waitForFunction(
    () =>
      window.musicAudioElements
        .at(-1)
        ?.currentSrc.includes("phase-index.mp3") &&
      !window.musicAudioElements.at(-1).paused,
  );

  // Local selection takes over the soundtrack; the BELMONDO OST button restores the defaults.
  await page
    .locator("#files")
    .setInputFiles(
      fileURLToPath(new URL("../public/music/ion-drift.mp3", import.meta.url)),
    );
  await page.waitForFunction(
    () =>
      window.musicAudioElements.at(-1)?.currentSrc.startsWith("blob:") &&
      !window.musicAudioElements.at(-1).paused,
  );
  await expect(page.locator("#music-status")).toContainText("ion-drift.mp3");
  await page.locator("#music-default").click();
  await page.waitForFunction(
    () =>
      window.musicAudioElements
        .at(-1)
        ?.currentSrc.includes("phase-index.mp3") &&
      !window.musicAudioElements.at(-1).paused,
  );
  await expect(page.locator("#music-status")).toContainText("3 TRACKS");

  // Music slider does not alter effects volume or mute; effects mute does not pause music.
  await page.locator("#music-dialog .close").click();
  await page.locator("#resume").click();
  await page.waitForFunction(() => !window.musicAudioElements.at(-1).paused);
  await page.locator("#volume").evaluate((element) => {
    element.value = "0.31";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const musicVolume = await page.evaluate(
    () => window.musicAudioElements.at(-1).volume,
  );
  assert.equal(
    musicVolume,
    0.31,
    "Music slider should set media-element volume",
  );
  await page.locator("#mute").evaluate((element) => {
    element.checked = true;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() => page.evaluate(() => window.effectMasterGain.gain.value))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(false);
  await page.locator("#mute").evaluate((element) => {
    element.checked = false;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() => page.evaluate(() => window.effectMasterGain.gain.value))
    .toBeCloseTo(0.22, 5);
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(false);
  const beforeBlur = await page.evaluate(
    () => window.musicAudioElements.at(-1).currentTime,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator("#resume").click();
  await page.waitForFunction(
    () =>
      !window.musicAudioElements.at(-1).paused &&
      window.musicAudioElements.at(-1).currentTime > 0.1,
  );
  assert(
    (await page.evaluate(() => window.musicAudioElements.at(-1).currentTime)) >
      beforeBlur,
    "Music playback should resume after focus and game resume",
  );
  await page.locator("#pause").click();
  await page.locator("#quit").click();
  await expect
    .poll(() => page.evaluate(() => window.musicAudioElements.at(-1).paused))
    .toBe(true);
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        audioInfo,
        portraitOverflow: false,
        playlistButtons: 3,
        checks: [
          "default starts in race gesture",
          "all MP3 metadata decodes",
          "native playback clock advances",
          "pause/resume preserves manual stop",
          "next and ended advance",
          "local override and OST restore",
          "independent music/effects controls",
          "blur and quit pause music",
          "portrait controls fit",
        ],
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
