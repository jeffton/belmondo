// Run headed (under xvfb-run on Linux) against a running game server.
// Playwright's default focus emulation prevents real tab visibility changes.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const profile = await mkdtemp(join(tmpdir(), "belmondo-native-focus-"));
const chrome = spawn(
  process.env.CHROME_PATH,
  [
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const stopped = new Promise((resolve) => chrome.once("close", resolve));
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    chrome.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    chrome.on("error", reject);
    chrome.on("exit", (code) => reject(new Error(`Chrome exited ${code}`)));
  });
  browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await page.setViewportSize({ width: 1280, height: 720 });
  await (
    await context.newCDPSession(page)
  ).send("Emulation.setFocusEmulationEnabled", {
    enabled: false,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.musicElements = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.musicElements.push(audio);
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    window.nativeFocusEvents = [];
    for (const event of ["focus", "blur"])
      window.addEventListener(event, () =>
        window.nativeFocusEvents.push(event),
      );
    document.addEventListener("visibilitychange", () =>
      window.nativeFocusEvents.push(document.visibilityState),
    );
  });
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5178");
  await page.bringToFront();
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  const away = await context.newPage();
  await (
    await context.newCDPSession(away)
  ).send("Emulation.setFocusEmulationEnabled", {
    enabled: false,
  });
  await away.goto("about:blank");
  await page.bringToFront();
  await goToSetupStage(page, "track");
  await page.locator("#tracks button").nth(2).click();
  await goToSetupStage(page, "craft");
  await page.locator("#start").click();
  await page.waitForFunction(
    () =>
      window.musicElements.at(-1)?.currentTime > 0.2 &&
      !window.musicElements.at(-1).paused,
  );
  const readAudio = () =>
    page.evaluate(() => ({
      src: window.musicElements.at(-1).currentSrc,
      time: window.musicElements.at(-1).currentTime,
      wallTime: performance.now(),
      events: [...window.nativeFocusEvents],
    }));
  async function switchAwayAndBack(expectedState) {
    await page.bringToFront();
    await page.waitForFunction(() => !window.musicElements.at(-1).paused);
    assert.equal(
      await page.evaluate(() => window.nullVector.telemetry.state),
      expectedState,
    );
    if (expectedState === "race")
      assert.equal(
        await page.evaluate(() => window.nullVector.telemetry.paused),
        false,
      );
    const before = await readAudio();
    await away.bringToFront();
    await page.waitForFunction(
      () =>
        document.hidden &&
        !document.hasFocus() &&
        window.musicElements.at(-1).paused,
    );
    const paused = await readAudio();
    await away.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const stillPaused = await readAudio();
    assert.equal(stillPaused.time, paused.time);
    await page.bringToFront();
    await page.waitForFunction(
      () =>
        !document.hidden &&
        document.hasFocus() &&
        !window.musicElements.at(-1).paused,
    );
    const resumed = await readAudio();
    assert.equal(resumed.src, before.src);
    assert.ok(resumed.time >= paused.time);
    // Media progress cannot exceed measured return time plus one display frame.
    assert.ok(
      resumed.time - paused.time <=
        (resumed.wallTime - stillPaused.wallTime) / 1000 + 1 / 60,
    );
    assert.ok(resumed.events.includes("blur"));
    assert.ok(resumed.events.includes("hidden"));
    assert.ok(resumed.events.includes("visible"));
    assert.ok(resumed.events.includes("focus"));
  }
  await switchAwayAndBack("race");
  console.log("Native race tab transition: PASS");
  await page.locator("#quit").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "menu",
  );
  await switchAwayAndBack("menu");
  await page.locator("#music-open").click();
  await page.locator("#music-play").click();
  await page.waitForFunction(() => window.musicElements.at(-1).paused);
  await away.bringToFront();
  await page.waitForFunction(() => document.hidden);
  await page.bringToFront();
  await page.waitForFunction(() => !document.hidden && document.hasFocus());
  assert.ok(await page.evaluate(() => window.musicElements.at(-1).paused));
  assert.deepEqual(errors, []);
  console.log(
    "Native race/menu tab visibility, music resume/manual pause: PASS",
  );
} finally {
  try {
    await browser?.close();
  } finally {
    chrome.kill("SIGTERM");
    await stopped;
    await promisify(execFile)("trash", [profile]);
  }
}
