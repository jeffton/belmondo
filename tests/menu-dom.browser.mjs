import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { makeTrack } from "../src/track.js";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

// Exercise the real menu and Race constructor without allocating a WebGL context.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-software-rasterizer"],
});
const errors = [];
const layout = makeTrack(0).config.layoutId;
const records = {
  [`${layout}-0-race-c1-5laps`]: 1,
  [`${layout}-0-trial-c2-5laps`]: 2,
  [`${layout}-0-trial-c3-5laps`]: 3,
  [`${layout}-0-race-c1-5laps-pace1.2`]: 100,
  [`${layout}-0-trial-c2-5laps-pace1.4`]: 120,
  [`${layout}-1-trial-c2-5laps-pace1.4`]: 130,
};
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1000, height: 625 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((seed) => {
      localStorage.setItem("nv-records", JSON.stringify(seed));
      window.requestAnimationFrame = () => 0;
    }, records);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/src/world.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export class World {
          environment = { terrain: undefined };
          view = 'chase';
          build() {} setupRacers() {} resize() {}
        }`,
      }),
    );
    await page.route("**/src/audio.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export class AudioEngine {
          async start() {} setMuted() {} setPaused() {} setVolume() {}
          stopSamples() {} stopEngine() {} stopCrowd() {}
        }`,
      }),
    );
    await page.route("**/src/music.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export class MusicPlayer {
          audio = { paused: true }; loadTracks() {} setMenu() {} setTunnel() {} async play() {} pause() {}
        }`,
      }),
    );
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.menuQA = () => ({
          selectedSpeedClass, mode: selectedMode(), quality: world.quality,
          raceClass: race.speedClass, raceMode: race.mode,
          pace: race.classSpec.pace, className: race.classSpec.name
        });
        window.finishQA = () => {
          race.player.finished = race.finished = true;
          race.resultTime = 42.12;
          showResults();
        };`,
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.menuQA);
    await goToSetupStage(page, "track");
    await page.locator("#tracks button").first().click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#best")).toHaveText("LOCAL RECORD / 01:40.00");
    await expect(page.locator("#speed-class label b")).toHaveText([
      "FLOW",
      "RUSH",
      "OVERDRIVE",
    ]);
    const initial = page.locator('input[name="speed-class"]:checked');
    await initial.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.locator('input[name="speed-class"][value="1"]'),
    ).toBeChecked();
    await page.locator('input[name="mode"][value="trial"]').check();
    await expect(page.locator("#best")).toHaveText("LOCAL RECORD / 02:00.00");
    await goToSetupStage(page, "craft");
    await page.locator("#crafts button").nth(1).click();
    await expect(page.locator("#best")).toHaveText("LOCAL RECORD / 02:10.00");
    await goToSetupStage(page, "class");
    await page.locator("#quality").check();
    expect(await page.evaluate(() => window.menuQA().quality)).toBe("retro");
    await page.locator("#quality").click();
    expect(await page.evaluate(() => window.menuQA().quality)).toBe("retro");
    await page.locator("#quality-clean").check();
    await page.locator("#quality-clean").click();
    expect(await page.evaluate(() => localStorage.getItem("nv-render"))).toBe(
      "clean",
    );
    await page.reload();
    await page.waitForFunction(() => window.menuQA);
    await goToSetupStage(page, "track");
    await page.locator("#tracks button").first().click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#quality")).not.toBeChecked();
    await page.locator("#quality").check();
    await page.reload();
    await page.waitForFunction(() => window.menuQA);
    await goToSetupStage(page, "track");
    await page.locator("#tracks button").first().click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#quality")).toBeChecked();
    await page.locator('input[name="speed-class"][value="2"]').check();
    await page.locator('input[name="mode"][value="trial"]').check();
    await expect(page.locator("#best")).toHaveText("LOCAL RECORD / —");
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual(records);
    await page.locator("#help-open").click();
    await expect(
      page.getByRole("heading", { name: "KEYBOARD", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "GAMEPAD", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "TOUCH", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "THE CIRCUIT", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await goToSetupStage(page, "craft");
    await page.locator("#start").click();
    expect(await page.evaluate(() => window.menuQA())).toMatchObject({
      selectedSpeedClass: 2,
      raceClass: 2,
      pace: 1.6,
      className: "C3 OVERDRIVE",
      raceMode: "trial",
      mode: "trial",
    });
    await page.evaluate(() => window.finishQA());
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#result-data")).toContainText(
      "C3 OVERDRIVE / 5 LAPS",
    );
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual({ ...records, [`${layout}-0-trial-c3-5laps-pace1.6`]: 42.12 });
    console.log(
      `Menu DOM/input/records/persistence PASS ${viewport.width}×${viewport.height}`,
    );
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
