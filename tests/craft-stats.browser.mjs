import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";
import { CRAFT } from "../src/race.js";
import { TRACKS } from "../src/track.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";
import { localRecordKey } from "../src/records.js";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

// Real markup, CSS and menu handlers; no WebGL/GPU allocation or RAF rendering.
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const errors = [];
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({
      headless: true,
      ...(engine === chromium
        ? { args: ["--disable-gpu", "--disable-software-rasterizer"] }
        : {}),
      ...(engine === webkit && process.env.WEBKIT_EXECUTABLE_PATH
        ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
        : {}),
    });
    try {
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 1000, height: 625 },
        { width: 390, height: 844 },
        { width: 320, height: 568 },
        { width: 852, height: 393 },
        { width: 568, height: 320 },
      ]) {
        const page = await browser.newPage({ viewport });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.requestAnimationFrame = () => 0;
          localStorage.setItem("nv-records", '{"preserved":42}');
          Object.defineProperty(navigator, "getGamepads", {
            get: () => () => (window.testPad ? [window.testPad] : []),
          });
        });
        for (const [module, body] of Object.entries({
          "world.js": `export class World {
            environment = {}; view = 'chase';
            resize() {} setupRacers() {}
            async prepare(_track, _data, current, setup) {
              const candidate = new World(); setup(candidate);
              return current() ? candidate : null;
            }
            adopt(candidate) { Object.assign(this, candidate); }
          }`,
          "course-preparation.js": `export class CoursePreparation {
            async load() { return {workerMs: 0}; } cancel() {}
          }`,
          "menu-preview.js": `export class MenuPreview {
            setStage(stage) { window.previewStage = stage; }
            setCraft(index) { window.previewCraft = index; }
            setClass() {} setTrack() {} dispose() {}
          }`,
          "audio.js": `export class AudioEngine {
            async start() {} setMuted() {} setPaused() {} setVolume() {}
            stopSamples() {} stopCrowd() {}
          }`,
          "music.js": `export class MusicPlayer {
            audio = {paused: true}; loadTracks() {} setMenu() {} setTunnel() {}
            async play() {} pause() {}
          }`,
        })) {
          await page.route(`**/src/${module}*`, (route) =>
            route.fulfill({ contentType: "text/javascript", body }),
          );
        }
        await page.route("**/src/main.js", async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body: `${await response.text()}
            window.craftQA = () => ({
              state, selectedCraft, raceCraft: race.player.craft,
              opponents: race.racers.slice(1).map(r => r.craft),
              key: recordKey(), controls: input()
            });`,
          });
        });
        await page.goto(server.resolvedUrls.local[0]);
        await page.waitForFunction(() => window.nullVector);
        await expect(page.locator("#craft-stats")).toBeHidden();
        await goToSetupStage(page, "track");
        await expect(page.locator("#craft-stats")).toBeHidden();
        await page.locator("#tracks button").nth(2).click();
        await goToSetupStage(page, "craft");
        await expect(page.locator("#craft-stats")).toBeVisible();
        await expect(page.locator(".world-caption")).toBeHidden();
        const preview = await page.locator("#menu-model").boundingBox();
        await expect(page.locator("#crafts button b")).toHaveText([
          "WRAITH",
          "STRIKER",
          "RAPTOR",
        ]);
        await expect(page.locator("#crafts button.active")).toHaveAttribute(
          "data-craft-index",
          "2",
        );
        // Native focus/activation follows the visible order, not physics indices.
        await expect(
          page.locator('#crafts [data-craft-index="2"]'),
        ).toBeFocused();
        for (const identity of [0, 1]) {
          await page.keyboard.press("Tab");
          await expect(
            page.locator(`#crafts [data-craft-index="${identity}"]`),
          ).toBeFocused();
          await page.keyboard.press("Enter");
          expect(
            await page.evaluate(() => window.craftQA().selectedCraft),
          ).toBe(identity);
        }
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Enter");
        expect(await page.evaluate(() => window.craftQA().selectedCraft)).toBe(
          2,
        );
        expect(CRAFT.map((craft) => craft.name)).toEqual([
          "STRIKER",
          "RAPTOR",
          "WRAITH",
        ]);
        const expectedScores = [
          [84, 81, 87],
          [100, 67, 74],
          [58, 100, 100],
        ];
        for (const i of [2, 0, 1]) {
          await page.locator(`#crafts button[data-craft-index="${i}"]`).click();
          const craft = CRAFT[i];
          await expect(page.locator("#model-name")).toHaveText(craft.name);
          await expect(page.locator("#craft-circuit")).toHaveText(
            TRACKS[2].name,
          );
          expect(await page.evaluate(() => window.previewCraft)).toBe(i);
          for (const key of ["thrust", "handling", "armor"]) {
            const stat = page.locator(`[data-stat="${key}"]`);
            const score =
              expectedScores[i][["thrust", "handling", "armor"].indexOf(key)];
            const text = String(score);
            await expect(stat.locator(".craft-stat-value")).toHaveText(text);
            await expect(stat.getByRole("meter")).toHaveAttribute(
              "aria-valuenow",
              text,
            );
            await expect(stat.getByRole("meter")).toHaveAttribute(
              "aria-valuemax",
              "100",
            );
            const ratio = await stat.evaluate(
              (el) =>
                el.querySelector("i").getBoundingClientRect().width /
                el.querySelector(".craft-stat-track").getBoundingClientRect()
                  .width,
            );
            expect(ratio).toBeCloseTo(score / 100, 2);
          }
          const bounds = await page.evaluate(() => {
            const rect = (selector) => {
              const { x, y, width, height, top, bottom, left, right } = document
                .querySelector(selector)
                .getBoundingClientRect();
              return { x, y, width, height, top, bottom, left, right };
            };
            return {
              stats: rect("#craft-stats"),
              preview: rect("#menu-model"),
              body: rect(".menu-body"),
              footer: rect(".menu-footer"),
              header: rect(".masthead"),
              scroll: [
                document.querySelector("#menu").scrollHeight,
                innerHeight,
              ],
            };
          });
          expect(bounds.preview).toMatchObject(preview);
          expect(bounds.stats.top).toBeGreaterThanOrEqual(
            bounds.preview.bottom,
          );
          expect(bounds.stats.bottom).toBeLessThanOrEqual(bounds.footer.top);
          expect(bounds.stats.left).toBeGreaterThanOrEqual(0);
          expect(bounds.stats.right).toBeLessThanOrEqual(viewport.width);
          expect(bounds.stats.top).toBeGreaterThanOrEqual(bounds.header.bottom);
          const intersectsBody =
            bounds.stats.left < bounds.body.right &&
            bounds.stats.right > bounds.body.left &&
            bounds.stats.top < bounds.body.bottom &&
            bounds.stats.bottom > bounds.body.top;
          expect(intersectsBody).toBe(false);
          expect(bounds.scroll[0]).toBeLessThanOrEqual(bounds.scroll[1]);
          const key = localRecordKey(
            TRACKS[2].layoutId,
            i,
            "race",
            SPEED_CLASSES[0],
            5,
          );
          expect((await page.evaluate(() => window.craftQA())).key).toBe(key);
          await page.locator("#start").click();
          await page.waitForFunction(() => window.craftQA().state === "race");
          await page.evaluate(() => {
            window.testPad = {
              axes: [0.5, 0],
              buttons: Array.from({ length: 16 }, (_, index) => ({
                pressed: index === 0,
                value: index === 0 ? 1 : 0,
              })),
            };
          });
          const actual = await page.evaluate(() => window.craftQA());
          expect(actual).toMatchObject({
            selectedCraft: i,
            raceCraft: i,
            key,
            opponents: [1, 2, 0, 1, 2, 0, 1],
          });
          expect(actual.controls).toMatchObject({ throttle: 1, steer: -0.5 });
          await page.evaluate(() => {
            window.testPad = null;
          });
          await page.keyboard.press("Escape");
          await page.locator("#quit").click();
        }
        expect(
          await page.evaluate(() => localStorage.getItem("nv-records")),
        ).toBe('{"preserved":42}');
        await goToSetupStage(page, "track");
        await expect(page.locator("#craft-stats")).toBeHidden();
        await page.locator("#tracks button").nth(6).click();
        await goToSetupStage(page, "craft");
        await expect(page.locator("#craft-circuit")).toHaveText(TRACKS[6].name);
        await expect(page.locator("#craft-stats .craft-stat-value")).toHaveText(
          ["100", "67", "74"],
        );
        console.log(
          `Craft stats PASS ${engine.name()} ${viewport.width}×${viewport.height}`,
        );
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  expect(errors).toEqual([]);
} finally {
  await server.close();
}
