import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";
import { CRAFT } from "../src/race.js";
import { TRACKS } from "../src/track.js";
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
        for (let i = 0; i < CRAFT.length; i++) {
          await page.locator("#crafts button").nth(i).click();
          const craft = CRAFT[i];
          await expect(page.locator("#model-name")).toHaveText(craft.name);
          await expect(page.locator("#craft-circuit")).toHaveText(
            TRACKS[2].name,
          );
          expect(await page.evaluate(() => window.previewCraft)).toBe(i);
          for (const key of ["thrust", "handling", "armor"]) {
            const stat = page.locator(`[data-stat="${key}"]`);
            const max = Math.max(...CRAFT.map((c) => c[key]));
            const text =
              key === "thrust"
                ? String(craft[key])
                : `${craft[key].toFixed(2)}×`;
            await expect(stat.locator(".craft-stat-value")).toHaveText(text);
            await expect(stat.getByRole("meter")).toHaveAttribute(
              "aria-valuenow",
              String(craft[key]),
            );
            await expect(stat.getByRole("meter")).toHaveAttribute(
              "aria-valuemax",
              String(max),
            );
            const ratio = await stat.evaluate(
              (el) =>
                el.querySelector("i").getBoundingClientRect().width /
                el.querySelector(".craft-stat-track").getBoundingClientRect()
                  .width,
            );
            expect(ratio).toBeCloseTo(craft[key] / max, 2);
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
          ["44", "1.23×", "1.15×"],
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
