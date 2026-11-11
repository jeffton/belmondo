import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-artifacts", { recursive: true });
const errors = [];
async function ready(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#mode").selectOption("trial");
  await page.locator("#quality").check();
}
async function start(page) {
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.1,
    {},
    { timeout: 30000 },
  );
  return page.evaluate(() => window.nullVector.telemetry);
}
async function reset(page) {
  await page.locator("#pause").click();
  await page.locator("#quit").click();
}
async function checkDirection(page, before, direction, label) {
  await page.waitForFunction(
    ({ position, direction }) =>
      (window.nullVector.telemetry.lateralPosition - position) * direction <
        -1 && window.nullVector.telemetry.roll * direction > 0.02,
    { position: before.lateralPosition, direction },
    { timeout: 10000 },
  );
  const after = await page.evaluate(() => window.nullVector.telemetry);
  const pixels =
    ((after.screenOffset - before.screenOffset) * page.viewportSize().width) /
    2;
  console.log(
    `${label}: rendered lateral displacement ${pixels.toFixed(1)} px; world lane ${after.lateralPosition.toFixed(2)} m; height ${after.height}`,
  );
  expect(
    Math.sign(pixels),
    `${label} must move toward the requested side in the current camera`,
  ).toBe(direction);
  expect(Math.abs(pixels)).toBeGreaterThan(3);
  expect(after.grounded).toBe(true);
  expect(after.height).toBeCloseTo(0, 0);
  expect(Math.sign(after.roll)).toBe(direction);
}
try {
  const desktop = await browser.newContext({
    viewport: { width: 960, height: 600 },
  });
  const page = await desktop.newPage();
  await ready(page);
  for (const [key, direction] of [
    ["ArrowLeft", -1],
    ["ArrowRight", 1],
    ["KeyA", -1],
    ["KeyD", 1],
    ["KeyQ", -1],
    ["KeyE", 1],
  ]) {
    const before = await start(page);
    await page.keyboard.down("ArrowUp");
    await page.keyboard.down(key);
    await checkDirection(page, before, direction, key);
    await page.keyboard.up(key);
    await page.keyboard.up("ArrowUp");
    await page.screenshot({ path: `test-artifacts/steering-${key}.png` });
    await reset(page);
  }
  await start(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => window.nullVector.telemetry.speed > 40,
    {},
    { timeout: 30000 },
  );
  await expect(page.locator("#race-message")).toHaveText("");
  expect(
    (await page.evaluate(() => window.nullVector.telemetry)).speed,
  ).toBeGreaterThan(40);
  await page.keyboard.up("ArrowUp");
  await reset(page);
  await page.locator("#help-open").click();
  const help = page.locator("#help-dialog");
  expect(await help.evaluate((el) => getComputedStyle(el).userSelect)).not.toBe(
    "none",
  );
  await page.locator("#help-dialog .close").click();
  await desktop.close();
  const gamepad = await browser.newContext({
    viewport: { width: 960, height: 600 },
  });
  await gamepad.addInitScript(() => {
    window.testPadAxis = 0;
    window.testPadButton = -1;
    window.testPadThrottle = false;
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [
        {
          axes: [window.testPadAxis, 0],
          buttons: Array.from({ length: 17 }, (_, i) => ({
            value:
              i === window.testPadButton || (i === 0 && window.testPadThrottle)
                ? 1
                : 0,
            pressed:
              i === window.testPadButton || (i === 0 && window.testPadThrottle),
          })),
          mapping: "standard",
          connected: true,
        },
      ],
    });
  });
  const g = await gamepad.newPage();
  await ready(g);
  for (const direction of [-1, 1]) {
    const before = await start(g);
    await g.evaluate((d) => {
      window.testPadAxis = d;
      window.testPadThrottle = true;
    }, direction);
    await checkDirection(g, before, direction, `gamepad ${direction}`);
    await g.evaluate(() => {
      window.testPadAxis = 0;
      window.testPadThrottle = false;
    });
    await reset(g);
  }
  for (const [button, direction] of [
    [4, -1],
    [5, 1],
  ]) {
    const before = await start(g);
    await g.evaluate((b) => {
      window.testPadButton = b;
      window.testPadThrottle = true;
    }, button);
    await checkDirection(g, before, direction, `gamepad airbrake ${button}`);
    await g.evaluate(() => {
      window.testPadButton = -1;
      window.testPadThrottle = false;
    });
    await reset(g);
  }
  await gamepad.close();
  const touch = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const t = await touch.newPage();
  await ready(t);
  const cdp = await touch.newCDPSession(t);
  for (const direction of [-1, 1]) {
    const before = await start(t),
      pad = await t.locator("#steer-pad").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: pad.x + pad.width * (direction > 0 ? 0.8 : 0.2),
          y: pad.y + pad.height / 2,
        },
      ],
    });
    await checkDirection(t, before, direction, `touch ${direction}`);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await t.screenshot({
      path: `test-artifacts/steering-touch-${direction}.png`,
    });
    await reset(t);
  }
  for (const [control, direction] of [
    ["airLeft", -1],
    ["airRight", 1],
  ]) {
    const before = await start(t),
      button = await t.locator(`[data-control=${control}]`).boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: button.x + button.width / 2,
          y: button.y + button.height / 2,
        },
      ],
    });
    await checkDirection(t, before, direction, `touch ${control}`);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await reset(t);
  }
  expect(
    await t.locator("#start").evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe("none");
  expect(
    await t
      .locator("#touch-fire")
      .evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe("none");
  await t.locator("#music-open").click();
  const chooser = t.waitForEvent("filechooser");
  await t.locator("label:has(#files)").click();
  expect((await chooser).isMultiple()).toBe(true);
  await touch.close();
  expect(errors).toEqual([]);
  console.log(
    "Keyboard, touch and gamepad steering/airbrakes match the rendered camera; vertical state unchanged, boost active without popup, scoped text selection and file chooser OK.",
  );
} finally {
  await browser.close();
}
