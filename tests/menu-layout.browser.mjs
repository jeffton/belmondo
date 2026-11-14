import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { mkdir } from "node:fs/promises";

const viewport = JSON.parse(process.env.MENU_VIEWPORT || "[1280,800]");
const output = process.env.MENU_ARTIFACTS || "/var/tmp/belmondo-menu-layout";
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] },
    deviceScaleFactor: 2,
    hasTouch: viewport[0] < 900,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.GAME_URL || server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
  await page.screenshot({ path: `${output}/${viewport.join("x")}-mode.png` });
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await page.waitForFunction(() => !window.nullVector.telemetry.trackLoading);
  const sizes = await page.locator("#tracks button").evaluateAll((buttons) =>
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
  await expect(page.locator("#model-subtitle")).toBeVisible();
  await expect(page.locator("#model-subtitle")).toHaveText("Polar observatory");
  await expect(page.locator("#tracks .track-lock").last()).toBeVisible();
  await page.screenshot({ path: `${output}/${viewport.join("x")}-track.png` });
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
  await expect(page.locator("#crafts .active")).toHaveClass(/menu-cursor/);
  await page.screenshot({ path: `${output}/${viewport.join("x")}-craft.png` });
  await expect(page.locator("#start")).toBeEnabled();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect(page.locator("#resume")).toHaveClass(/menu-cursor/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#restart")).toHaveClass(/menu-cursor/);
  const pauseSizes = await page
    .locator("#pause-panel .panel > button")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        width: button.offsetWidth,
        height: button.offsetHeight,
      })),
    );
  expect(new Set(pauseSizes.map((size) => size.width)).size).toBe(1);
  expect(new Set(pauseSizes.map((size) => size.height)).size).toBe(1);
  await page.screenshot({ path: `${output}/${viewport.join("x")}-pause.png` });
  await page.locator("#quit").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await expect(page.locator(".world-caption")).toBeHidden();
  await page.screenshot({ path: `${output}/${viewport.join("x")}-class.png` });
  // The actual quality control updates the independently rendered model buffer.
  await page.locator("#quality-clean").check();
  await page.waitForFunction(() => {
    const t = window.nullVector.telemetry;
    return t.previewResources.pixelRatio === devicePixelRatio;
  });
  await page.locator("#quality").check();
  await page.waitForFunction(() => {
    const t = window.nullVector.telemetry;
    return t.previewResources.pixelRatio === 0.55;
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    window.virtualMenuPad = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [null, window.virtualMenuPad],
    });
    window.virtualMenuPad.buttons[14].pressed = true;
  });
  await expect(
    page.locator('input[name="speed-class"][value="0"]'),
  ).toBeChecked();
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[14].pressed = false;
  });
  await expect(page.locator("body")).toHaveAttribute(
    "data-gamepad-connected",
    "true",
  );
  expect(
    await page
      .locator("#setup-next")
      .evaluate((button) => getComputedStyle(button, "::before").content),
  ).toContain("Ⓐ");
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[0].pressed = true;
  });
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[0].pressed = false;
  });
  await expect(page.locator("body")).toHaveAttribute(
    "data-input-mode",
    "gamepad",
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[1].pressed = true;
  });
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await page.evaluate(() => {
    window.virtualMenuPad = null;
  });
  await expect(page.locator("body")).toHaveAttribute(
    "data-gamepad-connected",
    "false",
  );
  expect(errors).toEqual([]);
  console.log(
    `Real WebGL menu, equal buttons, keyboard race/pause, LOWRES PASS ${viewport.join("×")}`,
  );
} finally {
  await browser.close();
  await server.close();
}
