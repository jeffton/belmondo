import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { makeTrack } from "../src/track.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";
import { LAPS_BY_CLASS } from "../src/race.js";
import { localRecordKey } from "../src/records.js";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

// Exercise the real menu and Race constructor without allocating a WebGL context.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
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
    LAPS_BY_CLASS[classIndex],
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
          async load(index) {
            if (window.holdCourseQA) await new Promise((resolve) => {
              window.courseResolversQA ||= {};
              window.courseResolversQA[index] = resolve;
            });
            return { workerMs: 0 };
          }
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
        body: `${await response.text()}\nwindow.menuGamepadQA = (x = 0, y = 0, pressed = []) => {
          window.menuPadQA = (x, y, pressed) => ({
            axes: [x, y],
            buttons: Array.from({ length: 16 }, (_, index) => ({
              pressed: pressed.includes(index),
              value: pressed.includes(index) ? 1 : 0,
            })),
          });
          window.__menuGamepadTime = (window.__menuGamepadTime || performance.now()) + 200;
          const pad = window.menuPadQA(x, y, pressed);
          return readMenuGamepad(pad, window.__menuGamepadTime);
        };
        window.menuInputQA = (x = 0, y = 0, pressed = []) => {
          const pad = window.menuPadQA(x, y, pressed);
          Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => [pad],
          });
          window.__menuGamepadTime += 200;
          readMenuGamepad(pad, window.__menuGamepadTime);
          return input();
        };
        window.pauseQA = () => setPaused(true);
        window.menuCursorQA = (selector) => {
          const element = document.querySelector(selector);
          menuNavigator.cursor = element.closest("label") || element;
          menuNavigator.sync();
        };
        window.menuQA = () => ({
          stage: menuStage, selectedSpeedClass, selectedCraft, selectedTrack, paused,
          previewTrack: menuPreview.track?.config.layoutId, trackLoading, loadedTrack,
          mode: selectedMode(), quality: world.quality,
          raceClass: race.speedClass, raceMode: race.mode,
          classId: race.classSpec.id, pace: race.classSpec.pace,
          className: race.classSpec.name, craft: race.player.craft,
          lapCount: race.lapCount,
          layoutId: race.track.config.layoutId
        });
        window.menuDirectionAuditQA = () => {
          const failures = [];
          const root = navigationRoot();
          const items = menuNavigator.items();
          for (const item of items) {
            for (const [key, dx, dy] of [
              ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0],
              ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]
            ]) {
              for (const device of ['keyboard', 'gamepad']) {
                menuNavigator.cursor = item;
                menuNavigator.sync();
                const from = item.getBoundingClientRect();
                if (device === 'keyboard')
                  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
                else {
                  window.menuGamepadQA();
                  window.menuGamepadQA(dx, dy);
                }
                const next = menuNavigator.cursor;
                if (!next || !menuNavigator.items().includes(next)) {
                  failures.push(item.textContent + ': hidden/disabled cursor');
                  continue;
                }
                if (root.id === 'menu' && next.closest('.setup-navigation'))
                  failures.push('Back/Select entered directional navigation');
                if (next === item) continue;
                const to = next.getBoundingClientRect();
                const movement = dx * (to.left + to.width / 2 - from.left - from.width / 2)
                  + dy * (to.top + to.height / 2 - from.top - from.height / 2);
                if (movement <= 1) failures.push(item.textContent + ': wrong direction ' + key + '/' + device);
                if (navigationRoot() !== root) failures.push('Direction activated a control');
              }
            }
          }
          menuNavigator.gamepad(null);
          return { count: items.length * 8, failures };
        };
        window.selectTrackQA = (index) => selectTrack(index);
        window.unlockFirstThreeQA = () => {
          const classId = SPEED_CLASSES[selectedSpeedClass].id;
          progression.classes[classId] = Object.fromEntries(
            TRACKS.slice(0, 3).map((track, index) => [track.layoutId, {
              bestPosition: [1, 2, 3][index], won: true
            }]),
          );
          localStorage.setItem("nv-progression", JSON.stringify(progression));
          refreshTrackProgression();
        };
        window.finishQA = (resultTime, rank = 1, eliminated = false, lapTimes = [40, 39, 39, 41, 42]) => {
          race.player.finished = race.finished = true;
          race.player.eliminated = eliminated;
          race.resultPosition = rank;
          race.resultTime = resultTime;
          race.laps = lapTimes;
          race.bestLap = Math.min(...lapTimes);
          showResults();
        };`,
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => window.menuQA);
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
    const classDirection = await page
      .locator("#speed-class label")
      .evaluateAll((labels) =>
        Math.abs(
          labels[0].getBoundingClientRect().top -
            labels[1].getBoundingClientRect().top,
        ) < 2
          ? "ArrowRight"
          : "ArrowDown",
      );
    await page.keyboard.press(classDirection);
    await expect(
      page.locator('input[name="speed-class"][value="1"]'),
    ).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    await expect(page.locator("#tracks .active")).toHaveClass(/menu-cursor/);
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(1);
    await expect(page.locator('#tracks [data-index="1"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#model-name")).toHaveText("MONSOON");
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(0);
    const tracksInOneRow = await page
      .locator("#tracks button")
      .evaluateAll(
        (buttons) =>
          Math.abs(
            buttons[0].getBoundingClientRect().top -
              buttons[2].getBoundingClientRect().top,
          ) < 2,
      );
    if (tracksInOneRow) {
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
    } else await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(2);
    if (tracksInOneRow) {
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
    } else await page.keyboard.press("ArrowUp");
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(0);
    await page.evaluate(() => window.menuCursorQA("#setup-next"));
    await page.keyboard.press("ArrowUp");
    await expect(
      page.locator("#tracks .menu-cursor:not(:disabled)"),
    ).toHaveCount(1);
    await page.evaluate(() => window.menuCursorQA("#tracks .active"));
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
    await expect(page.locator("#crafts .active")).toHaveClass(/menu-cursor/);
    const craftDirection = await page
      .locator("#crafts button")
      .evaluateAll((buttons) => {
        const a = buttons[0].getBoundingClientRect();
        const b = buttons[1].getBoundingClientRect();
        return Math.abs(a.top - b.top) < 2 ? "ArrowRight" : "ArrowDown";
      });
    await page.keyboard.press(craftDirection);
    expect(await page.evaluate(() => window.menuQA().selectedCraft)).toBe(0);
    await expect(page.locator("#model-name")).toHaveText("STRIKER");
    await page.evaluate((key) => {
      window.menuGamepadQA();
      window.menuGamepadQA(
        key === "ArrowRight" ? 1 : 0,
        key === "ArrowDown" ? 1 : 0,
      );
    }, craftDirection);
    expect(await page.evaluate(() => window.menuQA().selectedCraft)).toBe(1);
    await expect(page.locator("#model-name")).toHaveText("RAPTOR");
    await page.evaluate(() => window.menuGamepadQA());
    await page.evaluate(() => window.menuCursorQA("#start"));
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#crafts .menu-cursor")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
    await goToSetupStage(page, "mode");
    await page.evaluate(() => window.menuCursorQA('#mode input[value="race"]'));
    await expect(page.locator("#mode label.menu-cursor")).toHaveCount(1);
    const modeCursor = page.locator("#mode label.menu-cursor input");
    if ((await modeCursor.getAttribute("value")) === "trial")
      await page.keyboard.press("Enter");
    else await page.keyboard.press("ArrowDown");
    await expect(
      page.locator('input[name="mode"][value="trial"]'),
    ).toBeChecked();
    await page.evaluate(() => window.menuCursorQA("#quality"));
    await expect(page.locator("#render-quality.menu-cursor")).toHaveCount(1);
    await expect(page.locator("#render-quality")).toHaveCSS(
      "background-color",
      "rgb(255, 101, 77)",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#quality")).toBeChecked();
    await expect(
      page.locator('a[aria-label="BELMONDO on GitHub"]'),
    ).toHaveClass(/menu-cursor/);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#render-quality")).toHaveClass(/menu-cursor/);
    await expect(page.locator("#quality")).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(page.locator("#quality")).not.toBeChecked();
    await expect(page.locator("#quality-state")).toHaveText("OFF");
    await page.evaluate(() => {
      window.menuGamepadQA();
      window.menuGamepadQA(0, 0, [0]);
    });
    await expect(page.locator("#quality")).toBeChecked();
    await expect(page.locator("#quality-state")).toHaveText("ON");
    await page.evaluate(() => {
      window.menuGamepadQA();
      window.menuGamepadQA(-1, 0);
    });
    await expect(page.locator("#quality")).toBeChecked();
    await expect(page.locator("#render-quality")).not.toHaveClass(
      /menu-cursor/,
    );
    await page.evaluate(() => window.menuCursorQA("#help-open"));
    await expect(page.locator("#help-open.menu-cursor")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.locator("#help-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#help-dialog")).not.toBeVisible();
    await page.locator("#music-open").click();
    await expect(page.locator("#music-dialog")).toBeVisible();
    await page.evaluate(() => window.menuCursorQA("#volume"));
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#volume")).toHaveValue("0.66");
    await page.evaluate(() => window.menuGamepadQA(1, 0));
    await page.evaluate(() => window.menuGamepadQA(1, 0));
    await expect(page.locator("#volume")).toHaveValue("0.67");
    await page.keyboard.press("Escape");
    await expect(page.locator("#music-dialog")).not.toBeVisible();
    if (viewport.width === 1280) {
      await goToSetupStage(page, "class");
      await page.evaluate(() => window.menuCursorQA("#help-open"));
      for (let step = 0; step < 5; step++)
        await page.evaluate(() => window.menuGamepadQA(0, -1));
      await expect(
        page.locator(".speed-choices label.menu-cursor"),
      ).toHaveCount(1);
      await page.evaluate(() => window.menuGamepadQA(0.2, 0, [0]));
      expect(await page.evaluate(() => window.menuQA().stage)).toBe("track");
      await page.evaluate(() => window.menuGamepadQA(0.2, 0));
      await page.evaluate(() => window.menuGamepadQA(0.2, 0, [0]));
      expect(await page.evaluate(() => window.menuQA().stage)).toBe("craft");
      await page.evaluate(() => window.menuGamepadQA(0.2, 0));
      await expect(page.locator("#start")).toBeEnabled();
      await page.evaluate(() => window.menuGamepadQA(0.2, 0, [0]));
      await page.waitForFunction(
        () => window.nullVector.telemetry.state === "race",
      );
      const consumedRaceInput = await page.evaluate(() =>
        window.menuInputQA(0.2, 0, [0]),
      );
      expect(Math.abs(consumedRaceInput.steer)).toBe(0);
      expect(consumedRaceInput.pitch).toBe(0);
      expect(consumedRaceInput.throttle).toBeFalsy();
      await page.evaluate(() => window.menuInputQA(0, 0, []));
      await page.evaluate(() => window.pauseQA());
      await expect(page.locator("#pause-panel")).toBeVisible();
      expect(
        (await page.evaluate(() => window.menuDirectionAuditQA())).failures,
      ).toEqual([]);
      await page.evaluate(() => window.menuCursorQA("#resume"));
      await expect(page.locator("#resume")).toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await expect(
        page.locator("#pause-panel [data-keyboard-hint]"),
      ).toHaveCount(1);
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("#restart")).toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await expect(page.locator("#resume")).not.toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await page.keyboard.press("ArrowUp");
      await expect(page.locator("#resume")).toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await page.locator("#restart").dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
        button: 0,
      });
      await expect(page.locator("body")).toHaveAttribute(
        "data-input-mode",
        "touch",
      );
      await expect(page.locator("#resume")).toHaveCSS(
        "background-color",
        "rgb(255, 101, 77)",
      );
      await expect(page.locator("#restart")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      expect(
        await page
          .locator("#restart")
          .evaluate((button) => getComputedStyle(button, "::after").visibility),
      ).toBe("hidden");
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("#pause-music")).toHaveCSS(
        "background-color",
        "rgb(255, 101, 77)",
      );
      expect(
        await page
          .locator("#pause-music")
          .evaluate((button) => getComputedStyle(button, "::after").visibility),
      ).toBe("visible");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.evaluate(() => {
        window.menuGamepadQA();
        window.menuGamepadQA(0, 1);
      });
      await expect(page.locator("#restart")).toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await page.evaluate(() => {
        window.menuGamepadQA();
        window.menuGamepadQA(0, -1);
      });
      await expect(page.locator("#resume")).toHaveAttribute(
        "data-keyboard-hint",
        "ENTER",
      );
      await page.evaluate(() => window.menuGamepadQA(0, 0, [1]));
      await expect(page.locator("#pause-panel")).not.toBeVisible();
      await page.evaluate(() => window.menuInputQA(0, 0, [9]));
      await expect(page.locator("#pause-panel")).toBeVisible();
      await page.evaluate(() => window.menuInputQA());
      await page.evaluate(() => window.menuGamepadQA(0, 0, [9]));
      await page.evaluate(() => window.menuInputQA(0, 0, [9]));
      expect(await page.evaluate(() => window.menuQA().paused)).toBe(false);
      await expect(page.locator("#pause-panel")).not.toBeVisible();
      await page.reload();
      await page.waitForFunction(() => window.menuQA);
      await goToSetupStage(page, "class");
      await page.locator('input[name="speed-class"][value="1"]').check();
    }
    await expect(page.locator("#crafts .craft-icon")).toHaveCount(0);
    await expect(page.locator("#crafts button")).toHaveText([
      /WRAITH/,
      /STRIKER/,
      /RAPTOR/,
    ]);
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
    await page.locator('#tracks button[data-index="0"]').click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#speed-class label b")).toHaveText([
      "INDUCTION",
      "RESONANCE",
      "SINGULARITY",
    ]);
    const selectedSpeed = page.locator('input[name="speed-class"]:checked');
    await expect(selectedSpeed).toHaveValue("1");
    await goToSetupStage(page, "mode");
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "craft");
    await page.locator('#crafts button[data-craft-index="1"]').click();
    await goToSetupStage(page, "class");
    await page.locator("#quality").check();
    expect(await page.evaluate(() => window.menuQA().quality)).toBe("retro");
    await page.locator("#quality").click();
    expect(await page.evaluate(() => window.menuQA().quality)).toBe("clean");
    await expect(page.locator("#quality-state")).toHaveText("OFF");
    expect(await page.evaluate(() => localStorage.getItem("nv-render"))).toBe(
      "clean",
    );
    await page.reload();
    await page.waitForFunction(() => window.menuQA);
    await goToSetupStage(page, "track");
    await page.locator('#tracks button[data-index="0"]').click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#quality")).not.toBeChecked();
    await page.locator("#quality").check();
    await page.reload();
    await page.waitForFunction(() => window.menuQA);
    await goToSetupStage(page, "track");
    await page.locator('#tracks button[data-index="0"]').click();
    await goToSetupStage(page, "class");
    await expect(page.locator("#quality")).toBeChecked();
    await page.locator('input[name="speed-class"][value="2"]').check();
    await goToSetupStage(page, "mode");
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "class");
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
    await expect(
      page.locator('#crafts button[data-craft-index="1"]'),
    ).toHaveClass(/menu-cursor/);
    await page.keyboard.press("Enter");
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
    await page.evaluate(() => window.finishQA(140, 2));
    await expect(page.locator("#results")).toBeVisible();
    const classRow = page.locator("#result-data > div").filter({
      hasText: "CLASS",
    });
    await expect(classRow.locator("b")).toHaveText("RESONANCE");
    await expect(classRow).not.toContainText("LAPS");
    await expect(page.locator("#result-data .best-lap-mark")).toHaveCount(2);
    await expect(page.locator("#result-data")).not.toContainText(
      "LOCAL RECORD",
    );
    const totalRow = page.locator("#result-data > div").filter({
      hasText: "TOTAL TIME",
    });
    await expect(totalRow).toContainText("02:20.00");
    await expect(totalRow.locator(".new-record-mark")).toHaveCount(0);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
    ).toEqual(records);

    await page.locator("#result-quit").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    await expect(page.locator("#tracks button[aria-pressed=true]")).toHaveClass(
      /menu-cursor/,
    );
    await expect(
      page.locator("#tracks button[aria-pressed=true]"),
    ).not.toBeFocused();
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
    await page.evaluate(() => window.finishQA(42.12, 1));
    await expect(page.locator("#results")).toBeVisible();
    await expect(totalRow.locator(".new-record-mark")).toHaveText("NEW RECORD");
    expect(
      await totalRow
        .locator("b")
        .evaluate((value) =>
          Array.from(
            value.children,
            (child) => child.className || child.textContent,
          ),
        ),
    ).toEqual(["result-mark new-record-mark", "00:42.12"]);
    await expect(page.locator("#result-data .best-lap-mark")).toHaveCount(2);
    expect(
      await page
        .locator("#result-data .best-lap-mark")
        .first()
        .evaluate((mark) =>
          Array.from(
            mark.parentElement.children,
            (child) => child.className || child.textContent,
          ),
        ),
    ).toEqual(["result-mark best-lap-mark", "00:39.00"]);
    await expect(page.locator("#result-title")).toHaveText("YOU WON");
    for (const [rank, title] of [
      [1, "YOU WON"],
      [2, "2ND PLACE"],
      [3, "3RD PLACE"],
      [4, "4TH PLACE"],
      [5, "5TH PLACE"],
      [6, "6TH PLACE"],
      [7, "7TH PLACE"],
      [8, "YOU LOST"],
    ]) {
      await page.evaluate((rank) => window.finishQA(42.12, rank), rank);
      await expect(page.locator("#result-title")).toHaveText(title);
    }
    await page.evaluate(() => window.finishQA(42.12, 8, true));
    await expect(page.locator("#result-title")).toHaveText("ELIMINATED");
    expect(
      (await page.evaluate(() => window.menuDirectionAuditQA())).failures,
    ).toEqual([]);
    await expect(page.locator(".eyebrow").last()).not.toContainText(
      "CLASSIFIED",
    );
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
    await goToSetupStage(page, "track");
    const assertEqualTrackButtons = async () => {
      const sizes = await page
        .locator("#tracks button")
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const { width, height } = button.getBoundingClientRect();
            return { width, height };
          }),
        );
      expect(
        Math.max(...sizes.map((size) => size.height)) -
          Math.min(...sizes.map((size) => size.height)),
      ).toBeLessThan(1);
      expect(
        Math.max(...sizes.map((size) => size.width)) -
          Math.min(...sizes.map((size) => size.width)),
      ).toBeLessThan(1);
    };
    await assertEqualTrackButtons();
    const trackButtons = page.locator("#tracks button");
    await expect(trackButtons).toHaveCount(7);
    for (let index = 0; index < 3; index++)
      await expect(trackButtons.nth(index)).toBeEnabled();
    for (let index = 3; index < 7; index++)
      await expect(trackButtons.nth(index)).toBeDisabled();
    await page.evaluate(() => window.selectTrackQA(3));
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(0);
    await page.evaluate(() => window.unlockFirstThreeQA());
    for (let index = 0; index < 4; index++)
      await expect(trackButtons.nth(index)).toBeEnabled();
    await expect(trackButtons.nth(0)).toContainText("★ BEST / 1ST");
    await expect(trackButtons.nth(1)).toContainText("★ BEST / 2ND");
    await expect(trackButtons.nth(2)).toContainText("★ BEST / 3RD");
    await assertEqualTrackButtons();
    await trackButtons.nth(3).click();
    await expect(trackButtons.nth(3)).toHaveAttribute("aria-pressed", "true");
    await goToSetupStage(page, "mode");
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "track");
    await expect(trackButtons.nth(3)).toBeEnabled();
    await goToSetupStage(page, "class");
    await page.locator('input[name="speed-class"][value="1"]').check();
    expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(0);
    await goToSetupStage(page, "track");
    await expect(trackButtons.nth(3)).toBeDisabled();
    await page.evaluate(() => {
      window.holdCourseQA = true;
      window.menuCursorQA('#tracks button[data-index="0"]');
    });
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("body")).toHaveClass(/course-loading/);
    await expect(page.locator("#model-name")).toHaveText("MONSOON");
    const monsoonPreview = await page.evaluate(
      () => window.menuQA().previewTrack,
    );
    await expect(page.locator("#menu-model")).toHaveCSS("opacity", "1");
    await expect(page.locator("#game")).toHaveCSS("opacity", "0");
    await page.evaluate((horizontal) => {
      window.menuGamepadQA();
      if (horizontal) window.menuGamepadQA(1, 0);
      else {
        window.menuGamepadQA(-1, 0);
        window.menuGamepadQA();
        window.menuGamepadQA(0, 1);
      }
    }, tracksInOneRow);
    await expect(page.locator("#model-name")).toHaveText("KAISEKI COAST");
    const coastPreview = await page.evaluate(
      () => window.menuQA().previewTrack,
    );
    expect(coastPreview).not.toBe(monsoonPreview);
    await page.evaluate(() => window.courseResolversQA[1]());
    expect(await page.evaluate(() => window.menuQA().previewTrack)).toBe(
      coastPreview,
    );
    await expect(page.locator("body")).toHaveClass(/course-loading/);
    await page
      .locator('#tracks button[data-index="0"]')
      .dispatchEvent("pointerdown", { pointerType: "touch" });
    await page.locator('#tracks button[data-index="0"]').click();
    await expect(page.locator("#model-name")).toHaveText("WHITEOUT");
    const whiteoutPreview = await page.evaluate(
      () => window.menuQA().previewTrack,
    );
    await page.evaluate(() => window.courseResolversQA[2]());
    expect(await page.evaluate(() => window.menuQA().previewTrack)).toBe(
      whiteoutPreview,
    );
    await expect(page.locator("body")).toHaveClass(/course-loading/);
    await page.evaluate(() => window.courseResolversQA[0]());
    await page.waitForFunction(
      () => window.menuQA().loadedTrack === 0 && !window.menuQA().trackLoading,
    );
    await expect(page.locator("body")).not.toHaveClass(/course-loading/);
    await page.evaluate(() => {
      window.holdCourseQA = false;
    });
    let directionalChecks = 0;
    for (const stage of ["mode", "class", "track", "craft"]) {
      await goToSetupStage(page, stage);
      const audit = await page.evaluate(() => window.menuDirectionAuditQA());
      expect(audit.failures).toEqual([]);
      directionalChecks += audit.count;
    }
    for (const dialog of ["help", "music", "art"]) {
      await page.locator(`#${dialog}-open`).click();
      const audit = await page.evaluate(() => window.menuDirectionAuditQA());
      expect(audit.failures).toEqual([]);
      directionalChecks += audit.count;
      await page.keyboard.press("Escape");
    }
    console.log(
      `Menu DOM/input/records/persistence PASS ${viewport.width}×${viewport.height}; ${directionalChecks} keyboard/gamepad direction checks`,
    );
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
