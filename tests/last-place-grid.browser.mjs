import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const mobile = process.env.GRID_MOBILE === "1";
const speedClass = Number(process.env.GRID_CLASS || 0);
const server = process.env.GAME_URL
  ? null
  : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.GAME_URL || server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#setup-next").click();
  await page
    .locator(`input[name="speed-class"][value="${speedClass}"]`)
    .check();
  await page.locator("#setup-next").click();
  await page.locator("#setup-next").click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  const grid = await page.evaluate(() => window.nullVector.telemetry);
  expect(grid.position).toBe(8);
  expect(grid.laps).toBe(speedClass + 3);
  expect(grid.lap).toBe(1);
  expect(grid.countdown).toBeGreaterThan(0);
  await expect(page.locator("#position")).toContainText("8");
  if (!mobile) await page.keyboard.down("w");
  await page.waitForFunction(() => window.nullVector.telemetry.time > 1, null, {
    timeout: 30000,
  });
  if (!mobile) await page.keyboard.up("w");
  const running = await page.evaluate(() => window.nullVector.telemetry);
  expect(running.speed).toBeGreaterThan(0);
  expect(running.lap).toBe(1);
  expect(running.position).toBeGreaterThanOrEqual(1);
  expect(running.position).toBeLessThanOrEqual(8);
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.locator("#quit").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "menu",
  );
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      mobile,
      speedClass,
      gridPosition: grid.position,
      laps: grid.laps,
      runningSpeed: running.speed,
      position: running.position,
      errors,
    }),
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
