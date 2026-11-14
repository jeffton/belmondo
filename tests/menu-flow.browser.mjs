import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { TRACKS } from "../src/track.js";

const url = process.env.GAME_URL || "http://127.0.0.1:5196";
const output = process.env.MENU_ARTIFACTS || "/var/tmp/belmondo-menu-flow";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
try {
  const viewports = process.env.MENU_VIEWPORTS
    ? JSON.parse(process.env.MENU_VIEWPORTS)
    : [
        [1440, 900],
        [390, 844],
        [320, 568],
        [844, 390],
        [568, 320],
      ];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 900 ? 2 : 1,
      hasTouch: width < 900,
      isMobile: width < 900,
    });
    await context.addInitScript(
      (layoutIds) => {
        localStorage.setItem(
          "nv-progression",
          JSON.stringify({
            version: 1,
            classes: {
              c3: Object.fromEntries(
                layoutIds.map((id) => [id, { bestPosition: 1, won: true }]),
              ),
            },
          }),
        );
      },
      TRACKS.map((track) => track.layoutId),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    const landing = await page.evaluate(
      () => window.nullVector.telemetry.menuRacers[0].s,
    );
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
    await page.locator("#setup-next").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
    await expect(
      page.locator(".menu-steps, [data-step], #track-count"),
    ).toHaveCount(0);
    await expect(page.getByText("01 / 03", { exact: true })).toHaveCount(0);
    await page.waitForFunction(
      (s) => window.nullVector.telemetry.menuRacers[0].s > s,
      landing,
    );
    await expect(page.locator("#tracks")).toBeHidden();
    await expect(page.locator("#start")).toBeHidden();
    await page.locator('input[name="speed-class"][value="2"]').check();
    await page.locator("#setup-next").click();
    for (const stage of ["track", "craft"]) {
      if (stage === "track")
        await page.locator("#tracks button").nth(6).click();
      else await page.locator('#crafts button[data-craft-index="2"]').click();
      await expect(page.locator("#menu")).toHaveAttribute("data-stage", stage);
      await expect(page.locator("#menu-model")).toBeVisible();
      const rotation = await page.evaluate(
        () => window.nullVector.telemetry.menuModelRotation,
      );
      await page.waitForFunction(
        (r) => window.nullVector.telemetry.menuModelRotation !== r,
        rotation,
      );
      if (width === 1440 && stage === "track") {
        const samples = [];
        for (let cycle = 0; cycle < 2; cycle++) {
          for (let i = 0; i < 7; i++) {
            await page.locator("#tracks button").nth(i).click();
            const before = await page.evaluate(
              () => window.nullVector.telemetry.menuModelRotation,
            );
            await page.waitForFunction(
              (r) => window.nullVector.telemetry.menuModelRotation !== r,
              before,
            );
          }
          samples.push(
            await page.evaluate(() => ({
              world: window.nullVector.telemetry.resources,
              preview: window.nullVector.telemetry.previewResources,
            })),
          );
        }
        // The live feed's moving camera changes visible World buffers. The
        // complete inset model has a fixed footprint across replacement cycles.
        expect(samples[1].preview.geometries).toBe(
          samples[0].preview.geometries,
        );
        expect(samples[1].preview.textures).toBe(samples[0].preview.textures);
        console.log("Seven-track resource cycle stable:", samples[1]);
      }
      const backgroundBuffer = await page
        .locator("#game")
        .evaluate((canvas) => [canvas.width, canvas.height]);
      expect(backgroundBuffer).toEqual([
        Math.round(width * 0.55),
        Math.round(height * 0.55),
      ]);
      const nativePreview = await page
        .locator(".menu-preview-canvas")
        .evaluate((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return {
            width: canvas.width,
            height: canvas.height,
            cssWidth: rect.width,
            cssHeight: rect.height,
            dpr: devicePixelRatio,
          };
        });
      expect(nativePreview.width).toBeGreaterThanOrEqual(
        Math.floor(nativePreview.cssWidth * 0.55),
      );
      expect(nativePreview.height).toBeGreaterThanOrEqual(
        Math.floor(nativePreview.cssHeight * 0.55),
      );
      const layout = await page.evaluate(() => {
        const menu = document.getElementById("menu");
        const model = document
          .getElementById("menu-model")
          .getBoundingClientRect();
        const body = document
          .querySelector(".menu-body")
          .getBoundingClientRect();
        const visible = [
          ...document.querySelectorAll("#menu button, #menu a, #menu input"),
        ].filter((e) => e.getClientRects().length);
        return {
          scroll: menu.scrollHeight - menu.clientHeight,
          width: innerWidth,
          height: innerHeight,
          model: { top: model.top, bottom: model.bottom, right: model.right },
          body: {
            top: body.top,
            bottom: body.bottom,
            left: body.left,
            right: body.right,
          },
          headerBottom: document
            .querySelector("#menu .masthead")
            .getBoundingClientRect().bottom,
          footerTop: document
            .querySelector("#menu footer")
            .getBoundingClientRect().top,
          outside: visible
            .filter((e) => {
              const b = e.getBoundingClientRect();
              return (
                b.left < -1 ||
                b.top < -1 ||
                b.right > innerWidth + 1 ||
                b.bottom > innerHeight + 1
              );
            })
            .map((e) => e.id || e.textContent),
        };
      });
      expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(1);
      expect(layout.outside, JSON.stringify(layout)).toEqual([]);
      expect(layout.model.top).toBeGreaterThanOrEqual(0);
      expect(layout.body.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(
        layout.headerBottom - 1,
      );
      expect(layout.body.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(
        layout.footerTop + 1,
      );
      if (width < 700 && height > width)
        expect(layout.model.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(
          layout.body.top + 2,
        );
      await page.screenshot({
        path: `${output}/${width}-${height}-${stage}.png`,
      });
      if (stage === "track") await page.locator("#setup-next").click();
    }
    await page.locator("#setup-back").click();
    await expect(page.locator("#tracks button").nth(6)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("#setup-back").click();
    await expect(
      page.locator('input[name="speed-class"][value="2"]'),
    ).toBeChecked();
    await page.locator("#setup-next").click();
    await page.locator("#setup-next").click();
    await expect(
      page.locator('#crafts button[data-craft-index="2"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator("#help-open").click();
    await expect(page.locator("#help-dialog")).toBeVisible();
    await page.locator("#help-dialog .close").click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(await page.evaluate(() => window.nullVector.telemetry.classId)).toBe(
      "c3",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#quit").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
    await expect(page.locator("#start")).toBeVisible();
    await page.waitForFunction(
      (s) => window.nullVector.telemetry.menuRacers[0].s !== s,
      landing,
    );
    console.log(
      `${width}×${height}: stages, selections, responsive bounds, livefeed, race and return PASS`,
    );
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
