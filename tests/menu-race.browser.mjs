import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { mkdir } from "node:fs/promises";
import { TRACKS } from "../src/track.js";

let server;
let url = process.env.GAME_URL;
if (process.env.GAME_ROOT) {
  server = await preview({
    root: process.env.GAME_ROOT,
    preview: { host: "127.0.0.1", port: 0 },
  });
  url = server.resolvedUrls.local[0];
}
if (!url) throw new Error("Set GAME_URL or GAME_ROOT to the built game.");
const viewport = JSON.parse(process.env.MENU_VIEWPORT || "[960,600]");
const indices = JSON.parse(process.env.MENU_TRACKS || "[0,1,2,3,4,5,6]");
const output = process.env.MENU_ARTIFACTS;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const mobile = viewport[0] < 600;
  const page = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(
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
      localStorage.setItem("nv-renderer", "webgpu");
      if (!localStorage.getItem("nv-records"))
        localStorage.setItem("nv-records", '{"menu-race-check":42}');
    },
    TRACKS.map((track) => track.layoutId),
  );
  const target = new URL(url);
  target.searchParams.set("renderer", "webgpu");
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  const records = await page.evaluate(() => localStorage.getItem("nv-records"));
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await expect(page.locator(".menu-footer #render-quality")).toBeVisible();
  await expect(page.locator(".menu-footer .menu-links > *")).toHaveCount(4);
  await page.locator('input[name="speed-class"][value="2"]').check();
  await page.locator("#setup-next").click();
  await expect(page.locator("#tracks button")).toHaveCount(7);
  for (const index of indices) {
    await page.locator(`#tracks button[data-index="${index}"]`).click();
    await page.waitForFunction((index) => {
      const t = window.nullVector.telemetry;
      return (
        !t.trackLoading && t.loadedTrack === index && t.selectedTrack === index
      );
    }, index);
    const rotation = await page.evaluate(
      () => window.nullVector.telemetry.menuModelRotation,
    );
    await page.waitForFunction(
      (rotation) => window.nullVector.telemetry.menuModelRotation !== rotation,
      rotation,
    );
    const view = await page.evaluate(() => {
      const t = window.nullVector.telemetry;
      const canvas = document
        .querySelector(".menu-preview-canvas")
        .getBoundingClientRect();
      return {
        track: t.loadedTrack,
        calls: t.drawCalls,
        preview: t.previewResources,
        expectedWidth: Math.floor(canvas.width * 0.55),
        expectedHeight: Math.floor(canvas.height * 0.55),
      };
    });
    expect(view.calls).toBeGreaterThan(0);
    expect(view.preview.renderCalls).toBeGreaterThan(0);
    expect(view.preview.width).toBe(view.expectedWidth);
    expect(view.preview.height).toBe(view.expectedHeight);
    if (output)
      await page.screenshot({
        path: `${output}/${viewport[0]}-track-${index}.png`,
      });
    await page.locator("#setup-next").click();
    await expect(page.locator("#craft-stats")).toBeVisible();
    await page.bringToFront();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(
      await page.evaluate(() => window.nullVector.telemetry.loadedTrack),
    ).toBe(index);
    if (!(await page.evaluate(() => window.nullVector.telemetry.paused)))
      await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#quit").click();
    await page.locator("#setup-back").click();
    console.log(
      JSON.stringify({
        viewport,
        index,
        menuAndLowresPreview: true,
        raceStartPauseReturn: true,
      }),
    );
  }
  expect(await page.evaluate(() => localStorage.getItem("nv-records"))).toBe(
    records,
  );
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
