import { chromium, expect } from "@playwright/test";
import { toKilometresPerHour } from "../src/units.js";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const speedClass of [0, 1, 2]) {
    const touch = process.env.TOUCH === "1";
    const page = await browser.newPage({
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: touch,
      hasTouch: touch,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.distanceLabels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (/^\d+ m$/.test(text)) window.distanceLabels.push(text);
        return fillText.call(this, text, ...args);
      };
    });
    await page.goto(process.env.GAME_URL || "http://127.0.0.1:5198");
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "class");
    await page.locator(`#speed-class input[value="${speedClass}"]`).check();
    await goToSetupStage(page, "craft");
    await page.locator('#crafts button[data-craft-index="1"]').click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    if (!touch) await page.keyboard.down("w");
    await page.waitForFunction(
      () =>
        window.nullVector.telemetry.countdown <= 0 &&
        window.nullVector.telemetry.speed > 50,
    );
    const samples = await page.evaluate(async () => {
      const values = [];
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          values.push({
            speed: window.nullVector.telemetry.speed,
            speedClass: window.nullVector.telemetry.speedClass,
            displayed: Number(document.querySelector("#speed").textContent),
            fill: document.querySelector("#speed-bar").style.width,
          });
          if (values.length === 12) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(document.querySelector("#speed"), { childList: true });
      });
      return values;
    });
    for (const sample of samples) {
      expect(sample.speedClass).toBe(speedClass);
      expect(sample.displayed).toBe(
        Math.round(toKilometresPerHour(sample.speed)),
      );
      expect(parseFloat(sample.fill)).toBeCloseTo(
        Math.min(
          100,
          (sample.speed / (175 * [1.2, 1.4, 1.6][speedClass])) * 100,
        ),
        3,
      );
    }
    expect(
      await page.evaluate(() => [...new Set(window.distanceLabels)]),
    ).toEqual(expect.arrayContaining(["236 m", "131 m", "52 m"]));
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ touch, speedClass, samples }));
    await page.close();
  }
} finally {
  await browser.close();
}
