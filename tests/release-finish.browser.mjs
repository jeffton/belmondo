import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const mobile = process.env.RELEASE_MOBILE === "1";
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
    isMobile: mobile,
    hasTouch: mobile,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.GAME_URL || server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await expect(page.locator("#tracks button:disabled")).toHaveCount(4);
  for (let i = 0; i < 5; i++) await page.locator(".wordmark").click();
  await expect(page.locator("#circuit-test-access")).toHaveText(
    "TEST · NO RECORDS",
  );
  await expect(page.locator("#tracks button:disabled")).toHaveCount(0);
  await page.locator("#setup-next").click();
  await page.locator("#setup-next").click();
  for (let index = 0; index < 7; index++) {
    await page.locator("#tracks button").nth(index).click();
    await page.waitForFunction(
      (i) =>
        window.nullVector.telemetry.selectedTrack === i &&
        !window.nullVector.telemetry.trackLoading,
      index,
    );
  }
  await page.locator("#setup-next").click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await expect(page.locator("#circuit-test-access")).toBeVisible();
  const overlap = await page.evaluate(() => {
    const badge = document
      .querySelector("#circuit-test-access")
      .getBoundingClientRect();
    return ["pause", "view"].some((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return (
        badge.left < b.right &&
        badge.right > b.left &&
        badge.top < b.bottom &&
        badge.bottom > b.top
      );
    });
  });
  expect(overlap).toBe(false);
  if (!mobile) await page.keyboard.down("w");
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.5);
  if (!mobile) await page.keyboard.up("w");
  const racing = await page.evaluate(() => window.nullVector.telemetry);
  expect(racing.speed).toBeGreaterThan(0);
  if (mobile) await page.locator("#pause").tap();
  else await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.locator("#quit").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "menu",
  );
  await page.locator("#circuit-test-access").click();
  await expect(page.locator("#circuit-test-access")).toBeHidden();
  await expect(page.locator("#tracks button:disabled")).toHaveCount(4);
  expect(
    await page.evaluate(() => [
      localStorage.getItem("nv-records"),
      localStorage.getItem("nv-progression"),
    ]),
  ).toEqual([null, null]);
  await page.locator("#music-open").click();
  await expect(page.locator("#music-dialog")).toBeVisible();
  await expect(page.locator("#mute")).toHaveCount(0);
  for (const id of ["volume", "effects-volume"]) {
    await page.locator(`#${id}`).fill("0");
    await page.locator(`#${id}`).fill("0.5");
  }
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      url: process.env.GAME_URL || "local production preview",
      mobile,
      tracks: 7,
      gesture: "enabled then disabled",
      controlsClear: !overlap,
      raceSpeed: racing.speed,
      savedResults: "unchanged",
      soundSliders: "0 then 0.5",
      errors,
    }),
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
