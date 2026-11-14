import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0];
const wait = (page, condition) =>
  page.waitForFunction(condition, undefined, { polling: 100 });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}
          window.requestAnimationFrame = () => 0;
          window.soundQA = {
            sound, music,
            cursor(id) {
              menuNavigator.cursor = document.getElementById(id).closest('label');
              menuNavigator.sync();
            },
            gamepad(x = 0, y = 0) {
              readMenuGamepad({axes: [0, 0], buttons: []}, performance.now() + 500);
              return readMenuGamepad({axes: [x, y], buttons: []}, performance.now() + 1000);
            }
          };`,
      });
    });
    await page.goto(url);
    await wait(page, () => window.soundQA);
    await page.locator("#music-open").click();
    await expect(page.locator("#music-dialog")).toBeVisible();
    await expect(page.locator("#mute")).toHaveCount(0);
    await expect(
      page.locator("#music-dialog p:not(.eyebrow):not(#music-status)"),
    ).toHaveCount(0);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    for (const id of ["volume", "effects-volume"]) {
      await page.evaluate((id) => window.soundQA.cursor(id), id);
      await page.keyboard.press("ArrowLeft");
      const initial = id === "volume" ? 0.65 : 0.8;
      await expect(page.locator(`#${id}`)).toHaveValue(String(initial - 0.01));
      await page.evaluate(() => window.soundQA.gamepad(1, 0));
      await expect(page.locator(`#${id}`)).toHaveValue(String(initial));
      await page.locator(`#${id}`).evaluate((slider) => {
        slider.value = "0";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    // The real HTMLMediaElement and Web Audio music graph, unlocked by a gesture.
    await page.locator("#music-default").click();
    await wait(page, () => window.soundQA.music.context?.state === "running");
    await page.evaluate(() => {
      const { music } = window.soundQA;
      window.musicTapQA = music.context.createAnalyser();
      music.sceneGain.connect(window.musicTapQA);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pcm = new Float32Array(window.musicTapQA.fftSize);
          window.musicTapQA.getFloatTimeDomainData(pcm);
          return Math.max(...pcm.map(Math.abs));
        }),
      )
      .toBe(0);
    assert.deepEqual(
      await page.evaluate(() => ({
        music: window.soundQA.music.volume,
        effects: window.soundQA.sound.volume,
        muted: window.soundQA.sound.muted,
      })),
      { music: 0, effects: 0, muted: false },
    );
    await page.reload();
    await wait(page, () => window.soundQA);
    await expect(page.locator("#volume")).toHaveValue("0");
    await expect(page.locator("#effects-volume")).toHaveValue("0");
    await page.locator("#music-open").click();
    await page.locator("#volume").evaluate((slider) => {
      slider.value = "0.4";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#effects-volume").evaluate((slider) => {
      slider.value = "0.6";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#music-default").click();
    await wait(page, () => window.soundQA.music.context?.state === "running");
    await page.evaluate(() => {
      const { music } = window.soundQA;
      window.musicTapQA = music.context.createAnalyser();
      music.sceneGain.connect(window.musicTapQA);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pcm = new Float32Array(window.musicTapQA.fftSize);
          window.musicTapQA.getFloatTimeDomainData(pcm);
          return Math.max(...pcm.map(Math.abs));
        }),
      )
      .toBeGreaterThan(0.001);
    await page.keyboard.press("Escape");
    await expect(page.locator("#music-dialog")).not.toBeVisible();
    await page.reload();
    await wait(page, () => window.soundQA);
    await expect(page.locator("#volume")).toHaveValue("0.4");
    await expect(page.locator("#effects-volume")).toHaveValue("0.6");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Sound settings: keyboard/controller, independent zero/normal volumes, persistent state, music PCM and desktop/mobile dialog passed",
  );
} finally {
  await browser.close();
  await server.close();
}
