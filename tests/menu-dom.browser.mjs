import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { makeTrack } from "../src/track.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";
import { localRecordKey } from "../src/records.js";
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
const coast = makeTrack(0);
const solar = makeTrack(1);
const layout = coast.config.layoutId;
const key = (track, craft, mode, classIndex) =>
  localRecordKey(
    track.config.layoutId,
    craft,
    mode,
    SPEED_CLASSES[classIndex],
    5,
  );
const records = {
  [`${layout}-0-race-c1-5laps`]: 1,
  [`${layout}-0-trial-c2-5laps`]: 2,
  [`${layout}-0-trial-c3-5laps`]: 3,
  [key(coast, 0, "race", 0)]: 100,
  [key(coast, 0, "trial", 1)]: 120,
  [key(coast, 1, "trial", 1)]: 130,
  [key(coast, 1, "race", 1)]: 90,
  [key(coast, 1, "trial", 0)]: 110,
  [key(solar, 1, "trial", 1)]: 115,
  [key(solar, 0, "trial", 1)]: 140,
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
      if (!localStorage.getItem("nv-records"))
        localStorage.setItem("nv-records", JSON.stringify(seed));
      window.requestAnimationFrame = () => 0;
    }, records);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/src/world.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `import { PerspectiveCamera, Vector3 } from '/node_modules/.vite/deps/three.js';
        export class World {
          environment = { terrain: undefined };
          view = 'chase';
          renderer = { info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } } };
          camera = new PerspectiveCamera();
          ships = [];
          build() {} resize() {}
          setupRacers(race) {
            this.ships = race.racers.map(() => ({
              position: new Vector3(), rotation: { z: 0 }
            }));
          }
          async prepare(track, _prepared, isCurrent, setup) {
            const candidate = new World();
            candidate.build(track);
            setup(candidate);
            return isCurrent() ? candidate : null;
          }
          adopt(candidate) { Object.assign(this, candidate); }
        }`,
      }),
    );
    await page.route("**/src/course-preparation.js**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export class CoursePreparation {
          async load() { return { workerMs: 0 }; }
          cancel() {}
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
          selectedSpeedClass, selectedCraft, selectedTrack,
          mode: selectedMode(), quality: world.quality,
          raceClass: race.speedClass, raceMode: race.mode,
          classId: race.classSpec.id, pace: race.classSpec.pace,
          className: race.classSpec.name, craft: race.player.craft,
          layoutId: race.track.config.layoutId
        });
        window.finishQA = (resultTime) => {
          race.player.finished = race.finished = true;
          race.resultTime = resultTime;
          showResults();
        };`,
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.menuQA);
    await expect(page.locator("#best")).toHaveCount(0);
    const footer = page.locator("#menu footer.menu-footer");
    await expect(footer).not.toContainText(
      /KEYBOARD|GAMEPAD|TOUCH|LOCAL RECORD/i,
    );
    for (const selector of [
      "#help-open",
      "#music-open",
      "#art-open",
      'a[aria-label="BELMONDO on GitHub"]',
    ])
      await expect(footer.locator(selector)).toBeVisible();
    await goToSetupStage(page, "track");
    await page.locator("#tracks button").first().click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#speed-class label b")).toHaveText([
      "INDUCTION",
      "RESONANCE",
      "SINGULARITY",
    ]);
    const initial = page.locator('input[name="speed-class"]:checked');
    await initial.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.locator('input[name="speed-class"][value="1"]'),
    ).toBeChecked();
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "craft");
    await page.locator('#crafts button[data-craft-index="1"]').click();
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
    await page.locator('input[name="speed-class"][value="1"]').check();
    await goToSetupStage(page, "craft");
    await page.locator('#crafts button[data-craft-index="1"]').click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(await page.evaluate(() => window.menuQA())).toMatchObject({
      selectedSpeedClass: 1,
      selectedCraft: 1,
      selectedTrack: 0,
      raceClass: 1,
      classId: "c2",
      pace: 1.4,
      className: "RESONANCE",
      craft: 1,
      layoutId: layout,
      raceMode: "trial",
      mode: "trial",
    });
    await page.evaluate(() => window.finishQA(140));
    await expect(page.locator("#results")).toBeVisible();
    const recordRow = page.locator("#result-data > div").filter({
      hasText: "LOCAL RECORD",
    });
    await expect(page.locator("#result-data")).toContainText(
      "RESONANCE / 5 LAPS",
    );
    await expect(recordRow).toContainText("02:10.00");
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual(records);

    await page.locator("#result-quit").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    await expect(
      page.locator("#tracks button[aria-pressed=true]"),
    ).toBeFocused();
    expect(await page.evaluate(() => window.menuQA())).toMatchObject({
      selectedSpeedClass: 1,
      selectedCraft: 1,
      selectedTrack: 0,
    });
    await goToSetupStage(page, "craft");
    await page.locator('#crafts button[data-craft-index="1"]').click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(await page.evaluate(() => window.menuQA())).toMatchObject({
      selectedSpeedClass: 1,
      selectedCraft: 1,
      selectedTrack: 0,
      raceClass: 1,
      classId: "c2",
      pace: 1.4,
      className: "RESONANCE",
      craft: 1,
      layoutId: layout,
      raceMode: "trial",
      mode: "trial",
    });
    await page.evaluate(() => window.finishQA(42.12));
    await expect(page.locator("#results")).toBeVisible();
    await expect(recordRow).toContainText("NEW RECORD");
    const earnedRecords = {
      ...records,
      [key(coast, 1, "trial", 1)]: 42.12,
    };
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual(earnedRecords);
    await page.reload();
    await page.waitForFunction(() => window.menuQA);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual(earnedRecords);
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
