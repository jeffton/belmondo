import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mockInputApp } from "./helpers/input-app-mocks.mjs";
import { prepareRaceSetup } from "./helpers/setup-menu.mjs";

// Exercise production input handlers + Race countdown without borrowing the GPU.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, watch: null },
});
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
  if (touch)
    // Equip one real SHIELD in the isolated fixture; application input and
    // Race.fire stay production code, with no writable application telemetry.
    await page.route("**/src/race.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export * from "/src/race.js?touch-fire-fixture";
          import { Race as Base } from "/src/race.js?touch-fire-fixture";
          export class Race extends Base {
            constructor(...args) {
              super(...args);
              this.player.weapon = "SHIELD";
            }
          }`,
      }),
    );
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
    await expect(page.locator("[data-control]")).toHaveCount(0);
    await expect(page.locator("#air-pad")).toHaveAccessibleName(
      "Airbrake stick: left/right airbrake, pull down to release thrust",
    );
    const cdp = await context.newCDPSession(page);
    const box = async (selector) => {
      const rect = await page.locator(selector).boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      return rect;
    };
    const airBox = await box("#air-pad");
    const fireBox = await box("#touch-fire");
    expect(fireBox.y + fireBox.height).toBeLessThan(airBox.y);
    const radius = airBox.width * 0.375;
    const air = (x, y) => ({
      id: 1,
      x: airBox.x + airBox.width / 2 + x * radius,
      y: airBox.y + 16 + y * radius,
    });
    const stickBox = await box("#steer-pad");
    const stick = {
      id: 2,
      x: stickBox.x + stickBox.width * 0.7,
      y: stickBox.y + stickBox.height * 0.3,
    };
    const fire = {
      id: 3,
      x: fireBox.x + fireBox.width / 2,
      y: fireBox.y + fireBox.height / 2,
    };
    const send = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await send("touchStart", [stick, air(-0.5, 0.5)]);
    await controls(page, {
      throttle: 0.5,
      launchIntent: false,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 0.5,
      airRight: 0,
    });
    await send("touchMove", [stick, air(0.6, 0.8)]);
    await controls(page, { throttle: 0.2, airLeft: 0, airRight: 0.6 });
    // Upward motion cannot invert coast, even beyond the top boundary.
    await send("touchMove", [stick, air(-0.5, -0.25)]);
    await controls(page, { throttle: 1, airLeft: 0.5, airRight: 0 });
    await send("touchMove", [stick, air(0, 1)]);
    await controls(page, { throttle: 0, airLeft: 0, airRight: 0 });
    // Actual third finger on Fire must not steal either stick's capture.
    await send("touchStart", [stick, air(0, 1), fire]);
    await controls(page, { throttle: 0, steer: -0.5, pitch: 0.5 });
    await send("touchEnd", [fire]);
    await controls(page, { throttle: 0, steer: -0.5, pitch: 0.5 });
    await send("touchEnd", [air(0, 1)]);
    await controls(page, {
      throttle: 1,
      launchIntent: true,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchCancel", []);
    await controls(page, {
      throttle: 1,
      launchIntent: true,
      steer: 0,
      pitch: 0,
    });
    await send("touchStart", [air(0, 1)]);
    await controls(page, { throttle: 0, launchIntent: false });
    await send("touchCancel", []);
    await controls(page, { throttle: 1, launchIntent: false });
    await expect(page.locator("#air-pad")).not.toHaveClass(/pressed/);
    await page.locator("#air-pad").evaluate((element) => {
      element.addEventListener(
        "pointerdown",
        (event) => {
          element.testPointerId = event.pointerId;
        },
        { once: true },
      );
    });
    await send("touchStart", [air(0, 1)]);
    await controls(page, { throttle: 0, launchIntent: false });
    await send("touchMove", [air(0, 0.9)]);
    await page.locator("#air-pad").evaluate((element) => {
      element.releasePointerCapture(element.testPointerId);
    });
    await send("touchMove", [air(0, 0.8)]);
    await controls(page, { throttle: 1, launchIntent: false });
    await send("touchEnd", []);
    await page.waitForFunction(
      () => window.nullVector.telemetry.countdown === 0,
    );
    expect((await read(page)).launch.success).toBe(false);
    // Numeric analog travel remains intact after countdown.
    await expect(page.locator("#touch-fire")).toBeEnabled();
    await expect(page.locator("#touch-fire")).toHaveAccessibleName(
      "Fire SHIELD",
    );
    await send("touchStart", [stick, air(-0.4, 0.5)]);
    await controls(page, {
      throttle: 0.5,
      airLeft: 0.4,
      airRight: 0,
      steer: -0.5,
      pitch: 0.5,
    });
    await send("touchStart", [stick, air(-0.4, 0.5), fire]);
    await page.waitForFunction(
      () => window.nullVector.telemetry.weapon === null,
    );
    await expect(page.locator("#touch-fire")).toBeDisabled();
    await controls(page, {
      throttle: 0.5,
      airLeft: 0.4,
      airRight: 0,
      steer: -0.5,
      pitch: 0.5,
    });
    await send("touchCancel", []);
    await controls(page, {
      throttle: 1,
      airLeft: 0,
      airRight: 0,
      steer: 0,
      pitch: 0,
    });
    await page.keyboard.down("KeyW");
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "keyboard",
    );
    await page.keyboard.up("KeyW");
    await controls(page, { throttle: false, launchIntent: false });
    await send("touchStart", [air(0, 1)]);
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "touch",
    );
    await send("touchEnd", []);
    await controls(page, { throttle: 1, launchIntent: false });
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
    // The first canvas contact restores the hidden touch controls.
    await send("touchStart", [air(0, 1)]);
    await send("touchEnd", []);
    await controls(page, { throttle: 1, launchIntent: false });
    await send("touchStart", [stick, air(0.6, 0.8)]);
    await controls(page, { throttle: 0.2, airRight: 0.6 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("#pause-panel")).toBeVisible();
    await send("touchCancel", []);
    await page.locator("#resume").tap();
    await controls(page, {
      throttle: 1,
      launchIntent: false,
      steer: 0,
      pitch: 0,
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
    "Keyboard/controller thrust, removed S/Down/B, analog touch + boolean desktop race throttle, guide and touch controls PASS (World/audio mocks; no GPU)",
  );
} finally {
  await browser.close();
  await server.close();
}
