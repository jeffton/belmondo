import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mockInputApp } from "./helpers/input-app-mocks.mjs";

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
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await controls(page, { throttle: 0, launchIntent: false });
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
    await expect(page.locator('[data-control="brake"]')).toHaveCount(0);
    await expect(page.locator('[data-control="thrust"]')).toHaveAccessibleName(
      "Hold for thrust",
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
    const thrust = await center('[data-control="thrust"]', 1);
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
      throttle: 0,
      launchIntent: false,
      steer: -0.5,
      pitch: 0.5,
    });
    await send("touchStart", [stick, thrust, left, right, fire]);
    await controls(page, {
      throttle: 1,
      launchIntent: true,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 1,
      airRight: 1,
    });
    await expect(page.locator('[data-control="thrust"]')).toHaveClass(
      /pressed/,
    );
    // Release only thrust: the stick and both airbrakes remain owned and held.
    await send("touchEnd", [thrust]);
    await controls(page, {
      throttle: 0,
      launchIntent: false,
      steer: -0.5,
      pitch: 0.5,
      airLeft: 1,
      airRight: 1,
    });
    await send("touchCancel", []);
    await controls(page, {
      throttle: 0,
      launchIntent: false,
      steer: 0,
      pitch: 0,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchStart", [thrust]);
    await controls(page, { throttle: 1, launchIntent: true });
    await send("touchCancel", []);
    await controls(page, { throttle: 0, launchIntent: false });
    await expect(page.locator('[data-control="thrust"]')).not.toHaveClass(
      /pressed/,
    );
    await page.waitForFunction(
      () => window.nullVector.telemetry.countdown === 0,
    );
    await controls(page, { throttle: false, launchIntent: false });
    await send("touchStart", [thrust]);
    await controls(page, { throttle: true, launchIntent: true });
    await page.keyboard.down("KeyW");
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "keyboard",
    );
    await page.keyboard.up("KeyW");
    await controls(page, { throttle: false, launchIntent: false });
    await send("touchCancel", []);
    // The first touch restores controls hidden by keyboard mode; it hits the canvas.
    await send("touchStart", [thrust]);
    await expect(page.locator("body")).toHaveAttribute(
      "data-input-mode",
      "touch",
    );
    await send("touchEnd", []);
    await send("touchStart", [thrust]);
    await controls(page, { throttle: true, launchIntent: true });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("#pause-panel")).toBeVisible();
    await send("touchCancel", []);
    await page.locator("#resume").tap();
    await controls(page, { throttle: false, launchIntent: false });
    await context.close();
    console.log(
      `Touch thrust hold/release/cancel/chord/mode-switch/blur PASS ${viewport.width}×${viewport.height}`,
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
