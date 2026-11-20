import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const directory = "test-artifacts/countdown-voice";
const countdownFiles = ["three", "two", "one", "go"].map(
  (word) => `/audio/voice/${word}.wav`,
);
const sequence = countdownFiles.map((file, index) => ({
  file,
  stage: 3 - index,
}));
await mkdir(directory, { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1100, height: 700 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ files, mobile }) => {
        // Identify native decoded buffers by the asset actually fetched, not
        // by duration: menu cues (and other effects) can also be short.
        const countdownAssets = new Set(files);
        const inputs = new WeakMap();
        const decoded = new WeakMap();
        const arrayBuffer = Response.prototype.arrayBuffer;
        Response.prototype.arrayBuffer = async function () {
          const bytes = await arrayBuffer.call(this);
          const path = new URL(this.url, location.href).pathname;
          if (countdownAssets.has(path)) inputs.set(bytes, path);
          return bytes;
        };
        const NativeContext = window.AudioContext;
        window.voiceStarts = [];
        window.outputTaps = [];
        window.AudioContext = class extends NativeContext {
          async decodeAudioData(bytes, ...callbacks) {
            const buffer = await super.decodeAudioData(bytes, ...callbacks);
            const file = inputs.get(bytes);
            if (file) decoded.set(buffer, file);
            return buffer;
          }
          createDynamicsCompressor() {
            const compressor = super.createDynamicsCompressor();
            const analyser = this.createAnalyser();
            analyser.fftSize = 2048;
            compressor.connect(analyser);
            window.outputTaps.push({ analyser, context: this });
            return compressor;
          }
          createBufferSource() {
            const source = super.createBufferSource();
            const start = source.start.bind(source);
            source.start = (...args) => {
              const file = decoded.get(source.buffer);
              start(...args);
              if (file) {
                window.voiceStarts.push({
                  file,
                  duration: source.buffer.duration,
                  stage: Math.ceil(window.nullVector.telemetry.countdown),
                  contextState: this.state,
                });
                if (window.voiceStarts.length === 1) {
                  // Deliver pause after this game frame and before the next one,
                  // without a Playwright round-trip racing the countdown.
                  queueMicrotask(() => {
                    if (mobile) document.querySelector("#pause").click();
                    else
                      window.dispatchEvent(
                        new KeyboardEvent("keydown", { code: "Escape" }),
                      );
                  });
                }
              }
            };
            return source;
          }
        };
      },
      { files: countdownFiles, mobile },
    );
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    // Music remains on: this is the actual mixed game, not a speech-only harness.
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "craft");
    await page.locator("#start").click();
    await expect(page.locator("#pause-panel")).toBeVisible({ timeout: 30_000 });
    assert.equal(await page.evaluate(() => window.voiceStarts.length), 1);
    const outputRms = async () => {
      await page.waitForTimeout(250);
      return page.evaluate(() => {
        const pcm = new Float32Array(2048);
        window.outputTaps[0].analyser.getFloatTimeDomainData(pcm);
        return Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
      });
    };
    assert(
      (await outputRms()) < 0.0001,
      "pause silences actual effects output",
    );
    const frozen = await page.evaluate(
      () => window.nullVector.telemetry.countdown,
    );
    await page.waitForTimeout(1100);
    assert.equal(
      await page.evaluate(() => window.nullVector.telemetry.countdown),
      frozen,
    );
    assert.equal(await page.evaluate(() => window.voiceStarts.length), 1);
    await page.locator("#resume").click();
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    const first = await page.evaluate(() => window.voiceStarts);
    assert.deepEqual(
      first.map(({ file, stage }) => ({ file, stage })),
      sequence,
    );
    assert(first.every((entry) => entry.contextState === "running"));
    assert(!(await page.locator("#race-message").isVisible()));
    if (mobile) await page.locator("#pause").tap();
    else await page.keyboard.press("Escape");
    await page.locator("#restart").click();
    await page.waitForFunction(() => window.voiceStarts.length >= 5);
    await page.screenshot({
      path: `${directory}/${mobile ? "mobile" : "desktop"}-three.png`,
    });
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    const all = await page.evaluate(() => window.voiceStarts);
    assert.deepEqual(
      all.map(({ file, stage }) => ({ file, stage })),
      [...sequence, ...sequence],
    );
    assert(all.every((entry) => entry.contextState === "running"));
    assert((await outputRms()) > 0.001, "gesture produces audible effects PCM");
    await page.evaluate(() => {
      const volume = document.querySelector("#effects-volume");
      volume.value = "0";
      volume.dispatchEvent(new Event("input"));
    });
    assert((await outputRms()) < 0.0001, "mute silences actual effects output");
    await page.evaluate(() => {
      const volume = document.querySelector("#effects-volume");
      volume.value = "0.8";
      volume.dispatchEvent(new Event("input"));
    });
    assert((await outputRms()) > 0.001, "unmute restores effects output");
    await writeFile(
      `${directory}/${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify(all, null, 2),
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
