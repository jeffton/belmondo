import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

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
      window.AudioContext = class extends NativeContext {
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          source.start = (...args) => {
            // These four short static clips are distinct from the .52/.86 s
            // synthesized signal cues and all continuously looping engine beds.
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
    await page.locator("#start").click();
    await page.waitForFunction(() => window.voiceStarts.length === 1);
    await page.locator("#pause").click();
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
    await page.locator("#pause").click();
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
    await writeFile(
      `${directory}/${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify(all, null, 2),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
