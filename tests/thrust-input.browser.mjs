import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mockInputApp } from "./helpers/input-app-mocks.mjs";
import { prepareRaceSetup } from "./helpers/setup-menu.mjs";

// Exercise production input handlers + Race countdown without borrowing the GPU.
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"],
});
const errors = [];
const read = (page) => page.evaluate(() => window.nullVector.telemetry);
async function controls(page, wanted) {
  await page
    .waitForFunction((wanted) => {
      const actual = window.nullVector.telemetry.controls;
      return Object.entries(wanted).every(([key, value]) =>
        typeof value === "number"
          ? Math.abs(actual[key] - value) < 0.0001
          : actual[key] === value,
      );
    }, wanted)
    .catch(async (error) => {
      console.error("Input mismatch", {
        wanted,
        actual: await read(page),
        mode: await page.locator("body").getAttribute("data-input-mode"),
      });
      throw error;
    });
  expect((await read(page)).controls).not.toHaveProperty("brake");
}
async function open(viewport, touch) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
  });
  await context.addInitScript(() => {
    window.inputPad = { axes: [0, 0], buttons: [], values: {} };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [
        {
          axes: window.inputPad.axes,
          buttons: Array.from({ length: 17 }, (_, index) => ({
            pressed: window.inputPad.buttons.includes(index),
            value:
              window.inputPad.values[index] ??
              Number(window.inputPad.buttons.includes(index)),
          })),
        },
      ],
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await mockInputApp(page);
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#help-open").click();
  const help = page.locator("#help-dialog");
  await expect(
    help.locator("kbd").filter({ hasText: /^[S↑↓←→]$/ }),
  ).toHaveCount(0);
  await expect(help.locator(".controller-map")).not.toContainText(/\bBRAKE\b/);
  await expect(help).not.toContainText(/launch|65.?80|BRAKE → RELEASE/i);
  await expect(help.locator("kbd").filter({ hasText: /^W$/ })).toBeVisible();
  expect(await help.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.locator("#help-dialog .close").click();
  await prepareRaceSetup(page, { mode: "trial" });
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await controls(page, { throttle: touch ? 1 : 0, launchIntent: false });
  return { context, page };
}
try {
  const { context, page } = await open({ width: 1280, height: 800 }, false);
  for (const key of ["KeyS", "ArrowDown"]) {
    await page.keyboard.down(key);
    await controls(page, {
      throttle: 0,
      launchIntent: false,
      steer: 0,
      pitch: 0,
    });
    await page.keyboard.up(key);
  }
  for (const key of ["KeyW", "ArrowUp"]) {
    await page.keyboard.down(key);
    await controls(page, { throttle: 1, launchIntent: true });
    await page.keyboard.up(key);
    await controls(page, { throttle: 0, launchIntent: false });
  }
  await page.evaluate(() => {
    window.inputPad.buttons = [1];
  });
  await page.waitForTimeout(60);
  await controls(page, { throttle: 0, launchIntent: false });
  await expect(page.locator("body")).toHaveAttribute(
    "data-input-mode",
    "keyboard",
  );
  await page.evaluate(() => {
    window.inputPad.buttons = [0, 1];
  });
  await controls(page, { throttle: 1, launchIntent: true });
  await page.evaluate(() => {
    window.inputPad.buttons = [1];
    window.inputPad.values = { 7: 0.65, 4: 0.4, 5: 0.7 };
    window.inputPad.axes = [0.5, -0.6];
  });
  await controls(page, {
    throttle: 0.65,
    launchIntent: true,
    steer: -0.5,
    pitch: 0.6,
    airLeft: 0.4,
    airRight: 0.7,
  });
  await page.evaluate(() => {
    window.inputPad.buttons = [];
    window.inputPad.values = {};
    window.inputPad.axes = [0, 0];
  });
  await controls(page, { throttle: 0, launchIntent: false });
  await page.waitForFunction(() => window.nullVector.telemetry.countdown === 0);
  await page.keyboard.down("KeyW");
  await controls(page, { throttle: true, launchIntent: true });
  await page.keyboard.up("KeyW");
  await controls(page, { throttle: false, launchIntent: false });
  await context.close();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const { context, page } = await open(viewport, true);
    await expect(
      page.locator('[data-control="brake"], [data-control="thrust"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-control="coast"]')).toHaveAccessibleName(
      "Hold to coast",
    );
    const cdp = await context.newCDPSession(page);
    const center = async (selector, id) => {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const coast = await center('[data-control="coast"]', 1);
    const stickBox = await page.locator("#steer-pad").boundingBox();
    const stick = {
      id: 2,
      x: stickBox.x + stickBox.width * 0.7,
      y: stickBox.y + stickBox.height * 0.3,
    };
    const left = await center('[data-control="airLeft"]', 3);
    const right = await center('[data-control="airRight"]', 4);
    const fire = await center("#touch-fire", 5);
    const send = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await send("touchStart", [stick]);
    await controls(page, {
      throttle: 1,
      launchIntent: false,
      steer: -0.5,
      pitch: 0.5,
    });
    await send("touchStart", [stick, coast, left, right, fire]);
    await controls(page, {
      throttle: 0,
      launchIntent: false,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 1,
      airRight: 1,
    });
    await expect(page.locator('[data-control="coast"]')).toHaveClass(/pressed/);
    // Release only coast; stick and both airbrakes retain pointer ownership.
    await send("touchEnd", [coast]);
    await controls(page, {
      throttle: 1,
      launchIntent: true,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 1,
      airRight: 1,
    });
    await send("touchCancel", []);
    // Canceling other controls cannot revoke an already deliberate coast release.
    await controls(page, {
      throttle: 1,
      launchIntent: true,
      steer: 0,
      pitch: 0,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchStart", [coast]);
    await controls(page, { throttle: 0, launchIntent: false });
    await send("touchCancel", []);
    await controls(page, { throttle: 1, launchIntent: false });
    await expect(page.locator('[data-control="coast"]')).not.toHaveClass(
      /pressed/,
    );
    await page.locator('[data-control="coast"]').evaluate((button) => {
      button.addEventListener(
        "pointerdown",
        (event) => {
          button.testPointerId = event.pointerId;
        },
        { once: true },
      );
    });
    await send("touchStart", [coast]);
    await controls(page, { throttle: 0, launchIntent: false });
    // Activate pending implicit capture before deliberately releasing it.
    await send("touchMove", [{ ...coast, x: coast.x + 10 }]);
    // Release actual browser pointer capture while the CDP finger remains held.
    await page.locator('[data-control="coast"]').evaluate((button) => {
      button.releasePointerCapture(button.testPointerId);
    });
    await send("touchMove", [{ ...coast, x: coast.x + 11 }]);
    await controls(page, { throttle: 1, launchIntent: false });
    await send("touchEnd", []);
    await controls(page, { throttle: 1, launchIntent: false });
    await page.waitForFunction(
      () => window.nullVector.telemetry.countdown === 0,
    );
    expect((await read(page)).launch.success).toBe(false);
    await controls(page, { throttle: true, launchIntent: false });
    await send("touchStart", [coast]);
    await controls(page, {
      throttle: false,
      launchIntent: false,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchEnd", []);
    await controls(page, { throttle: true, launchIntent: false });
    await page.keyboard.down("KeyW");
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "keyboard",
    );
    await page.keyboard.up("KeyW");
    await controls(page, { throttle: false, launchIntent: false });
    // First canvas touch restores touch input and automatic thrust.
    await send("touchStart", [coast]);
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "touch",
    );
    await send("touchEnd", []);
    await controls(page, { throttle: true, launchIntent: false });
    await page.evaluate(() => {
      window.inputPad.buttons = [0];
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "gamepad",
    );
    await page.evaluate(() => {
      window.inputPad.buttons = [];
    });
    await controls(page, { throttle: false, launchIntent: false });
    await send("touchStart", [coast]);
    await send("touchEnd", []);
    await controls(page, { throttle: true, launchIntent: false });
    await send("touchStart", [coast, left, right]);
    await controls(page, { throttle: false, airLeft: 1, airRight: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("#pause-panel")).toBeVisible();
    await send("touchCancel", []);
    await page.locator("#resume").tap();
    await controls(page, {
      throttle: true,
      launchIntent: false,
      airLeft: 0,
      airRight: 0,
    });
    await context.close();
    console.log(
      `Touch auto-thrust/coast/release/cancel/capture-loss/chord/mode-switch/blur PASS ${viewport.width}×${viewport.height}`,
    );
  }
  expect(errors).toEqual([]);
  console.log(
    "Keyboard/controller thrust, removed S/Down/B, numeric countdown + boolean race throttle, guide and touch controls PASS (World/audio mocks; no GPU)",
  );
} finally {
  await browser.close();
  await server.close();
}
