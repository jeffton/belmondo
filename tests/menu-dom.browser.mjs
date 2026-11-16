import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { makeTrack, TRACK_INDEX, TRACKS } from "../src/track.ts";
import { SPEED_CLASSES } from "../src/speed-classes.ts";
import { LAPS_BY_CLASS } from "../src/race.ts";
import { localRecordKey } from "../src/records.ts";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

// Real menu handlers and Race constructor, with rendering/audio dependencies mocked.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-software-rasterizer"],
});
const errors = [];
const coast = makeTrack(TRACK_INDEX.COAST);
const solar = makeTrack(TRACK_INDEX.SOLAR);
const key = (track, craft, mode, classIndex) =>
  localRecordKey(
    track.config.layoutId,
    craft,
    mode,
    SPEED_CLASSES[classIndex],
    LAPS_BY_CLASS[classIndex],
  );
const records = {
  [`${coast.config.layoutId}-0-race-c1-5laps`]: 1,
  [`${coast.config.layoutId}-0-trial-c2-5laps`]: 2,
  [`${coast.config.layoutId}-0-trial-c3-5laps`]: 3,
  [key(coast, 0, "race", 0)]: 100,
  [key(coast, 0, "trial", 1)]: 120,
  [key(coast, 1, "trial", 1)]: 130,
  [key(coast, 1, "race", 1)]: 90,
  [key(coast, 1, "trial", 0)]: 110,
  [key(solar, 1, "trial", 1)]: 115,
  [key(solar, 0, "trial", 1)]: 140,
};
const trackButton = (page, index) =>
  page.locator(`#tracks button[data-index="${index}"]`);

async function installMenuHarness(page) {
  await page.route("**/src/world.ts", (route) =>
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
          this.ships = race.racers.map(() => ({ position: new Vector3(), rotation: { z: 0 } }));
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
  await page.route("**/src/course-preparation.ts**", (route) =>
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
  await page.route("**/src/audio.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class AudioEngine {
        async start() {} setMuted() {} setPaused() {} setVolume() {} menuCue() {}
        stopSamples() {} stopEngine() {} stopCrowd() {}
      }`,
    }),
  );
  await page.route("**/src/music.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export class MusicPlayer {
        audio = { paused: true }; loadTracks() {} setMenu() {} setTunnel() {}
        async play() {} pause() {}
      }`,
    }),
  );
  await page.route("**/src/main.ts", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
      window.menuGamepadQA = (x = 0, y = 0, pressed = []) => {
        const pad = {
          axes: [x, y],
          buttons: Array.from({ length: 16 }, (_, index) => ({
            pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0
          }))
        };
        window.__menuGamepadTime = (window.__menuGamepadTime || performance.now()) + 200;
        window.menuPadQA = pad;
        return readMenuGamepad(pad, window.__menuGamepadTime);
      };
      window.menuInputQA = () => {
        Object.defineProperty(navigator, 'getGamepads', {
          configurable: true, value: () => [window.menuPadQA]
        });
        return input();
      };
      window.menuCursorQA = (selector) => {
        const element = document.querySelector(selector);
        menuNavigator.cursor = element.closest('label') || element;
        menuNavigator.sync();
      };
      window.menuQA = () => ({
        stage: menuStage, selectedSpeedClass, selectedCraft, selectedTrack,
        previewTrack: menuPreview.track?.config.layoutId, trackLoading, loadedTrack,
        mode: selectedMode(), quality: world.quality,
        raceClass: race.speedClass, raceMode: race.mode,
        classId: race.classSpec.id, craft: race.player.craft,
        lapCount: race.lapCount, layoutId: race.track.config.layoutId
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
            bestPosition: index + 1, won: true
          }])
        );
        localStorage.setItem('nv-progression', JSON.stringify(progression));
        refreshTrackProgression();
      };
      window.finishQA = (resultTime, rank = 1, eliminated = false) => {
        race.player.finished = race.finished = true;
        race.player.eliminated = eliminated;
        race.resultPosition = rank;
        race.resultTime = resultTime;
        race.laps = [40, 39, 39, 41];
        race.bestLap = 39;
        showResults();
      };`,
    });
  });
}

async function assertTrackGeometry(page) {
  const sizes = await page.locator("#tracks button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const { width, height } = button.getBoundingClientRect();
      return { width, height };
    }),
  );
  for (const dimension of ["width", "height"])
    expect(
      Math.max(...sizes.map((size) => size[dimension])) -
        Math.min(...sizes.map((size) => size[dimension])),
    ).toBeLessThan(1);
}

async function checkNavigation(page, viewport) {
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
  await page.keyboard.press("Enter");
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
  expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(
    TRACK_INDEX.MONSOON,
  );
  await expect(trackButton(page, TRACK_INDEX.MONSOON)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#model-name")).toHaveText(
    TRACKS[TRACK_INDEX.MONSOON].name,
  );
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(
    TRACK_INDEX.WHITEOUT,
  );
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
  expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(
    TRACK_INDEX.COAST,
  );
  await expect(page.locator("#model-name")).toHaveText(
    TRACKS[TRACK_INDEX.COAST].name,
  );
  await page.evaluate(() => window.menuCursorQA("#setup-next"));
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#tracks .menu-cursor:not(:disabled)")).toHaveCount(
    1,
  );
  await page.evaluate(() => window.menuCursorQA("#tracks .active"));
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
  await expect(page.locator("#crafts .active")).toHaveClass(/menu-cursor/);
  const craftDirection = await page
    .locator("#crafts button")
    .evaluateAll((buttons) =>
      Math.abs(
        buttons[0].getBoundingClientRect().top -
          buttons[1].getBoundingClientRect().top,
      ) < 2
        ? "ArrowRight"
        : "ArrowDown",
    );
  await page.keyboard.press(craftDirection);
  expect(await page.evaluate(() => window.menuQA().selectedCraft)).toBe(0);
  await expect(page.locator("#model-name")).toHaveText("STRIKER");
  await page.evaluate((direction) => {
    window.menuGamepadQA();
    window.menuGamepadQA(
      direction === "ArrowRight" ? 1 : 0,
      direction === "ArrowDown" ? 1 : 0,
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
  await assertTrackGeometry(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await goToSetupStage(page, "mode");
  await page.evaluate(() => window.menuCursorQA("#quality"));
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#quality")).toBeChecked();
  await expect(page.locator('a[aria-label="BELMONDO on GitHub"]')).toHaveClass(
    /menu-cursor/,
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#render-quality")).toHaveClass(/menu-cursor/);
  await expect(page.locator("#quality")).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(page.locator("#quality")).not.toBeChecked();
  await page.evaluate(() => {
    window.menuGamepadQA();
    window.menuGamepadQA(0, 0, [0]);
  });
  await expect(page.locator("#quality")).toBeChecked();
  const footer = page.locator("#menu footer.menu-footer");
  for (const selector of [
    "#help-open",
    "#music-open",
    "#art-open",
    'a[aria-label="BELMONDO on GitHub"]',
  ])
    await expect(footer.locator(selector)).toBeVisible();
  const geometry = await footer
    .locator(".menu-links > *")
    .evaluateAll((items) =>
      items.map((item) => {
        const { x, y, width, height } = item.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
  expect(
    Math.max(...geometry.map(({ width }) => width)) -
      Math.min(...geometry.map(({ width }) => width)),
  ).toBeLessThan(1);
  expect(
    geometry.every(
      ({ height, y, x, width }) =>
        height >= 44 &&
        y === geometry[0].y &&
        x >= 0 &&
        x + width <= viewport.width,
    ),
  ).toBe(true);
  let checks = 0;
  for (const stage of ["mode", "class", "track", "craft"]) {
    await goToSetupStage(page, stage);
    const audit = await page.evaluate(() => window.menuDirectionAuditQA());
    expect(audit.failures).toEqual([]);
    checks += audit.count;
  }
  for (const dialog of ["help", "music", "art"]) {
    await page.locator(`#${dialog}-open`).click();
    await expect(page.locator(`#${dialog}-dialog`)).toBeVisible();
    const audit = await page.evaluate(() => window.menuDirectionAuditQA());
    expect(audit.failures).toEqual([]);
    checks += audit.count;
    await page.keyboard.press("Escape");
    await expect(page.locator(`#${dialog}-dialog`)).not.toBeVisible();
  }
  console.log(
    `Menu navigation/geometry PASS ${viewport.width}×${viewport.height}; ${checks} keyboard/gamepad direction checks`,
  );
}

async function checkStateContracts(page) {
  await page.locator("#music-open").click();
  await page.evaluate(() => window.menuCursorQA("#volume"));
  const initialVolume = Number(await page.locator("#volume").inputValue());
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#volume")).toHaveValue(
    String(initialVolume + 0.01),
  );
  await page.evaluate(() => {
    window.menuGamepadQA();
    window.menuGamepadQA(1, 0);
    window.menuGamepadQA(1, 0);
  });
  await expect(page.locator("#volume")).toHaveValue(
    String(initialVolume + 0.02),
  );
  await page.keyboard.press("Escape");
  await goToSetupStage(page, "class");
  await page.locator('input[name="speed-class"][value="1"]').check();
  await goToSetupStage(page, "track");
  await trackButton(page, TRACK_INDEX.COAST).click();
  await goToSetupStage(page, "mode");
  await page.locator('input[name="mode"][value="trial"]').check();
  await goToSetupStage(page, "craft");
  await page.locator('#crafts button[data-craft-index="1"]').click();
  await page.locator("#quality").uncheck();
  expect(await page.evaluate(() => window.menuQA().quality)).toBe("clean");
  expect(await page.evaluate(() => localStorage.getItem("nv-render"))).toBe(
    "clean",
  );
  await page.reload();
  await page.waitForFunction(() => window.menuQA);
  await expect(page.locator("#quality")).not.toBeChecked();
  await page.locator("#quality").check();
  expect(await page.evaluate(() => window.menuQA().quality)).toBe("retro");
  await page.reload();
  await page.waitForFunction(() => window.menuQA);
  await expect(page.locator("#quality")).toBeChecked();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
  ).toEqual(records);
  await goToSetupStage(page, "mode");
  await page.locator('input[name="mode"][value="trial"]').check();
  await goToSetupStage(page, "class");
  await page.locator('input[name="speed-class"][value="1"]').check();
  await goToSetupStage(page, "track");
  await trackButton(page, TRACK_INDEX.COAST).click();
  await goToSetupStage(page, "craft");
  await page.locator('#crafts button[data-craft-index="1"]').click();
  await page.evaluate(() => {
    window.menuGamepadQA();
    window.menuGamepadQA(0.2, 0, [0]);
  });
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  const consumed = await page.evaluate(() => window.menuInputQA());
  expect(Math.abs(consumed.steer)).toBe(0);
  expect(consumed.pitch).toBe(0);
  expect(consumed.throttle).toBeFalsy();
  await page.evaluate(() => window.menuGamepadQA());
  const released = await page.evaluate(() => window.menuInputQA());
  expect(released.throttle).toBeFalsy();
  const selection = {
    selectedSpeedClass: 1,
    selectedCraft: 1,
    selectedTrack: TRACK_INDEX.COAST,
    raceClass: 1,
    classId: "c2",
    craft: 1,
    lapCount: LAPS_BY_CLASS[1],
    layoutId: coast.config.layoutId,
    raceMode: "trial",
    mode: "trial",
  };
  expect(await page.evaluate(() => window.menuQA())).toMatchObject(selection);
  await page.evaluate(() => window.finishQA(140, 2));
  await expect(page.locator("#results")).toBeVisible();
  const totalRow = page
    .locator("#result-data > div")
    .filter({ hasText: "TOTAL TIME" });
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
  expect(await page.evaluate(() => window.menuQA())).toMatchObject(selection);
  await goToSetupStage(page, "craft");
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  expect(await page.evaluate(() => window.menuQA())).toMatchObject(selection);
  await page.evaluate(() => window.finishQA(42.12, 1));
  await expect(totalRow.locator(".new-record-mark")).toHaveText("NEW RECORD");
  await expect(page.locator("#result-data .best-lap-mark")).toHaveCount(2);
  // Check the requested visual order, not a specific child-node/class recipe.
  for (const selector of [".new-record-mark", ".best-lap-mark"]) {
    const ordering = await page
      .locator(`#result-data ${selector}`)
      .evaluateAll((marks) =>
        marks.map((mark) => {
          const value = mark.parentElement.querySelector("span");
          const labelBox = mark.getBoundingClientRect();
          const valueBox = value.getBoundingClientRect();
          return (
            labelBox.right <= valueBox.left &&
            labelBox.top < valueBox.bottom &&
            valueBox.top < labelBox.bottom
          );
        }),
      );
    expect(ordering.every(Boolean)).toBe(true);
  }
  // Result placement is an explicit UX contract; exercise it once, not per viewport.
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
  const earnedRecords = { ...records, [key(coast, 1, "trial", 1)]: 42.12 };
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
  ).toEqual(earnedRecords);
  await page.reload();
  await page.waitForFunction(() => window.menuQA);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("nv-records"))),
  ).toEqual(earnedRecords);
  await goToSetupStage(page, "track");
  const trackButtons = page.locator("#tracks button");
  await expect(trackButtons).toHaveCount(TRACKS.length);
  for (let index = 0; index < TRACKS.length; index++) {
    if (index < 3) await expect(trackButtons.nth(index)).toBeEnabled();
    else await expect(trackButtons.nth(index)).toBeDisabled();
  }
  const beforeLockedSelection = await page.evaluate(() => window.menuQA());
  await page.evaluate(() => window.selectTrackQA(3));
  expect(await page.evaluate(() => window.menuQA())).toMatchObject({
    selectedTrack: beforeLockedSelection.selectedTrack,
    previewTrack: beforeLockedSelection.previewTrack,
  });
  await page.evaluate(() => window.unlockFirstThreeQA());
  for (let index = 0; index < 4; index++)
    await expect(trackButtons.nth(index)).toBeEnabled();
  await expect(trackButtons.nth(4)).toBeDisabled();
  for (const [index, place] of [
    [0, "1ST"],
    [1, "2ND"],
    [2, "3RD"],
  ])
    await expect(trackButtons.nth(index)).toContainText(`BEST / ${place}`);
  await assertTrackGeometry(page);
  await trackButtons.nth(3).click();
  await expect(trackButtons.nth(3)).toHaveAttribute("aria-pressed", "true");
  await goToSetupStage(page, "mode");
  await page.locator('input[name="mode"][value="trial"]').check();
  await goToSetupStage(page, "track");
  await expect(trackButtons.nth(3)).toBeEnabled();
  await goToSetupStage(page, "class");
  await page.locator('input[name="speed-class"][value="1"]').check();
  expect(await page.evaluate(() => window.menuQA().selectedTrack)).toBe(
    TRACK_INDEX.WHITEOUT,
  );
  await goToSetupStage(page, "track");
  await expect(trackButtons.nth(3)).toBeDisabled();
  // Three pending selections: completing old requests must not replace the latest preview/world.
  await page.evaluate(() => {
    window.holdCourseQA = true;
  });
  for (const index of [
    TRACK_INDEX.MONSOON,
    TRACK_INDEX.COAST,
    TRACK_INDEX.WHITEOUT,
  ]) {
    await trackButton(page, index).click();
    await expect(page.locator("#model-name")).toHaveText(TRACKS[index].name);
    await expect(page.locator("body")).toHaveClass(/course-loading/);
  }
  const pending = await page.evaluate(() => window.menuQA());
  const latestPreview = pending.previewTrack;
  await expect(page.locator("#menu-model")).toBeVisible();
  expect(latestPreview).toBe(TRACKS[TRACK_INDEX.WHITEOUT].layoutId);
  for (const index of [TRACK_INDEX.MONSOON, TRACK_INDEX.COAST]) {
    await page.evaluate((i) => window.courseResolversQA[i](), index);
    expect(await page.evaluate(() => window.menuQA())).toMatchObject({
      previewTrack: latestPreview,
      loadedTrack: pending.loadedTrack,
      trackLoading: true,
    });
    await expect(page.locator("body")).toHaveClass(/course-loading/);
  }
  await page.evaluate(
    (index) => window.courseResolversQA[index](),
    TRACK_INDEX.WHITEOUT,
  );
  await page.waitForFunction(
    (index) =>
      window.menuQA().loadedTrack === index && !window.menuQA().trackLoading,
    TRACK_INDEX.WHITEOUT,
  );
  await expect(page.locator("body")).not.toHaveClass(/course-loading/);
  console.log(
    "Menu race selection/results/records/persistence/progression/stale-loading contracts PASS desktop",
  );
}

try {
  for (const viewport of [
    { width: 1280, height: 800 },
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
    await installMenuHarness(page);
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.menuQA);
    await checkNavigation(page, viewport);
    if (viewport.width === 1280) await checkStateContracts(page);
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
