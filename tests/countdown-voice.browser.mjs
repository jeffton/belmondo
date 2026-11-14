import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const directory = "test-artifacts/countdown-voice";
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
    await page.addInitScript(() => {
      const NativeContext = window.AudioContext;
      window.voiceStarts = [];
      window.outputTaps = [];
      window.AudioContext = class extends NativeContext {
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
            // Four short static spoken words; continuous engine beds loop.
            if (source.buffer && source.buffer.duration < 0.4 && !source.loop) {
              window.voiceStarts.push({
                duration: source.buffer.duration,
                countdown: window.nullVector?.telemetry.countdown,
                contextState: this.state,
              });
            }
            return start(...args);
          };
          return source;
        }
      };
    });
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    // Music remains on: this is the actual mixed game, not a speech-only harness.
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "craft");
    await page.locator("#start").click();
    await page.waitForFunction(() => window.voiceStarts.length === 1);
    if (mobile) await page.locator("#pause").tap();
    else await page.keyboard.press("Escape");
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
      first.map((entry) => Math.ceil(entry.countdown)),
      [3, 2, 1, 0],
    );
    assert(first.every((entry) => entry.contextState === "running"));
    assert.equal(await page.locator("#race-message").textContent(), "");
    if (mobile) await page.locator("#pause").tap();
    else await page.keyboard.press("Escape");
    await page.locator("#restart").click();
    await page.waitForFunction(() => window.voiceStarts.length === 5);
    await page.screenshot({
      path: `${directory}/${mobile ? "mobile" : "desktop"}-three.png`,
    });
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    const all = await page.evaluate(() => window.voiceStarts);
    assert.deepEqual(
      all.map((entry) => Math.ceil(entry.countdown)),
      [3, 2, 1, 0, 3, 2, 1, 0],
    );
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
    await context.close();
  }
} finally {
  await browser.close();
}
