import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5215";
await mkdir("test-artifacts/input-mode", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
try {
  for (const [width, height, mobile] of [
    [1280, 900, false],
    [390, 844, true],
    [844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: mobile,
    });
    await context.addInitScript(() => {
      window.modePad = { axes: [0, 0], buttons: [], values: {} };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [
          {
            axes: window.modePad.axes,
            buttons: Array.from({ length: 17 }, (_, i) => ({
              pressed: window.modePad.buttons.includes(i),
              value:
                window.modePad.values[i] ??
                (window.modePad.buttons.includes(i) ? 1 : 0),
            })),
          },
        ],
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    await page.locator('input[name="mode"][value="trial"]').check();
    await page.locator("#start").click();
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    const visibility = async (visible) => {
      for (const selector of ["#view", "#pause", "#touch-controls"])
        if (visible) await expect(page.locator(selector)).toBeVisible();
        else await expect(page.locator(selector)).toBeHidden();
    };
    // hasTouch exposes a coarse primary pointer even in the desktop-sized hybrid context.
    await visibility(true);
    await page.keyboard.press("KeyV");
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "keyboard",
    );
    await expect(page.locator("#view")).toHaveAttribute("aria-pressed", "true");
    await visibility(false);
    if (mobile) await expect(page.locator("body")).toHaveClass(/\btouch\b/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeHidden();
    await page.evaluate(() => {
      window.modePad.axes = [0.6, -0.4];
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "gamepad",
    );
    await visibility(false);
    await page.evaluate(() => {
      window.modePad.buttons = [3];
    });
    await expect(page.locator("#view")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.evaluate(() => {
      window.modePad.buttons = [9];
    });
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.evaluate(() => {
      window.modePad.buttons = [];
    });
    await page.locator("#resume").tap();
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "touch",
    );
    await visibility(true);
    // A noisy held stick/sub-threshold trigger must not clear a live touch gesture.
    const cdp = await context.newCDPSession(page);
    const stick = await page.locator("#steer-pad").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: stick.x + stick.width * 0.8,
          y: stick.y + stick.height * 0.5,
        },
      ],
    });
    const transform = await page.locator("#steer-pad i").getAttribute("style");
    await page.evaluate(() => {
      window.modePad.axes = [0.601, -0.401];
      window.modePad.values = { 7: 0.05 };
    });
    await page.waitForFunction(
      () =>
        Math.abs(window.nullVector.telemetry.controls.steer + 0.601) < 0.0001,
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "touch",
    );
    await expect(page.locator("#steer-pad i")).toHaveAttribute(
      "style",
      transform,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await visibility(true);
    await page.locator("#view").tap();
    await expect(page.locator("#view")).toHaveAttribute("aria-pressed", "true");
    await visibility(true);
    await page.locator("#pause").tap();
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#resume").tap();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await page.screenshot({
      path: `test-artifacts/input-mode/touch-${width}.png`,
    });
    await page.evaluate(() => {
      window.modePad.axes = [-0.4, 0];
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "gamepad",
    );
    await visibility(false);
    await page.evaluate(() => {
      window.modePad.axes = [0, 0];
    });
    await page.keyboard.press("KeyW");
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "keyboard",
    );
    await visibility(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "Desktop/portrait/landscape: keyboard ↔ gamepad ↔ touch switches, View/Pause functionality and visibility PASS.",
  );
} finally {
  await browser.close();
}
