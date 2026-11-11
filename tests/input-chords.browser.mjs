import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5188";
await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [],
  samples = [];
async function ready(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#mode").selectOption("trial");
  await page.locator("#quality").selectOption("retro");
  await page.locator("#start").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  return page;
}
async function controls(page, name, expected) {
  await page.waitForFunction(
    (wanted) => {
      const actual = window.nullVector.telemetry.controls;
      return Object.entries(wanted).every(([key, value]) =>
        typeof value === "number"
          ? Math.abs(actual[key] - value) < 0.0001
          : actual[key] === value,
      );
    },
    expected,
    { timeout: 10000 },
  );
  const telemetry = await page.evaluate(() => window.nullVector.telemetry);
  samples.push({
    name,
    controls: telemetry.controls,
    bodyPitch: telemetry.pitch,
    time: telemetry.time,
    view: telemetry.view,
  });
  return telemetry;
}
try {
  const desktop = await browser.newContext({
    viewport: { width: 800, height: 500 },
  });
  await desktop.addInitScript(() => {
    // Synthetic standard browser input, not writable app/racer hooks.
    window.chordPad = { axes: [0, 0, 0, 0], buttons: [] };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [
        {
          axes: window.chordPad.axes,
          connected: true,
          mapping: "standard",
          buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: window.chordPad.buttons.includes(i),
            value: window.chordPad.buttons.includes(i) ? 1 : 0,
          })),
        },
      ],
    });
  });
  const page = await ready(desktop);
  for (const key of ["KeyW", "KeyD", "KeyJ", "KeyK"])
    await page.keyboard.down(key);
  await controls(page, "W+D+J+K", {
    throttle: true,
    steer: -1,
    airLeft: 1,
    airRight: 0,
    air: 1,
    pitch: -1,
    brake: false,
  });
  await page.waitForFunction(
    () => window.nullVector.telemetry.pitch < -0.03,
    {},
    { timeout: 10000 },
  );
  samples.push({
    name: "nose-up-body-response",
    ...(await page.evaluate(() => ({
      bodyPitch: window.nullVector.telemetry.pitch,
      controls: window.nullVector.telemetry.controls,
    }))),
  });
  for (const key of ["KeyD", "KeyK"]) await page.keyboard.up(key);
  await page.keyboard.down("KeyL");
  await controls(page, "W+J+L", {
    throttle: true,
    steer: 0,
    airLeft: 1,
    airRight: 1,
    air: 0,
    pitch: 0,
  });
  for (const key of ["KeyJ", "KeyL"]) await page.keyboard.up(key);
  for (const key of ["KeyQ", "KeyE"]) await page.keyboard.down(key);
  await controls(page, "W+Q+E", {
    throttle: true,
    airLeft: 1,
    airRight: 1,
    air: 0,
  });
  for (const key of ["KeyQ", "KeyE"]) await page.keyboard.up(key);
  await page.keyboard.down("KeyI");
  await controls(page, "W+I", { throttle: true, pitch: 1, air: 0 });
  await page.waitForFunction(
    () => window.nullVector.telemetry.pitch > 0.03,
    {},
    { timeout: 10000 },
  );
  samples.push({
    name: "nose-down-body-response",
    ...(await page.evaluate(() => ({
      bodyPitch: window.nullVector.telemetry.pitch,
      controls: window.nullVector.telemetry.controls,
    }))),
  });
  for (const key of ["KeyW", "KeyI"]) await page.keyboard.up(key);
  await controls(page, "keyboard-release", {
    throttle: false,
    pitch: 0,
    steer: 0,
    airLeft: 0,
    airRight: 0,
  });
  await page.evaluate(() => {
    window.chordPad.axes = [0.6, 0, 0, -0.75];
    window.chordPad.buttons = [0, 4, 5];
  });
  await controls(page, "gamepad-RSY-up+steer+both-brakes", {
    throttle: true,
    steer: -0.6,
    pitch: 0.75,
    airLeft: 1,
    airRight: 1,
    air: 0,
  });
  await page.evaluate(() => {
    window.chordPad.axes = [-0.4, 0, 0, 0.65];
    window.chordPad.buttons = [];
  });
  await controls(page, "gamepad-RSY-down", {
    throttle: false,
    steer: 0.4,
    pitch: -0.65,
    air: 0,
  });
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await ready(mobile);
  const cdp = await mobile.newCDPSession(touch);
  const pad = await touch.locator("#steer-pad").boundingBox();
  for (const [control, pitch, fraction, steer] of [
    ["pitchUp", -1, 0.8, -0.75],
    ["pitchDown", 1, 0.2, 0.75],
  ]) {
    const button = await touch
      .locator(`[data-control=${control}]`)
      .boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: pad.x + pad.width * fraction, y: pad.y + pad.height / 2 },
        {
          id: 2,
          x: button.x + button.width / 2,
          y: button.y + button.height / 2,
        },
      ],
    });
    await controls(touch, `CDP-two-finger-steer+${control}`, {
      throttle: true,
      steer,
      pitch,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await controls(touch, `CDP-release-${control}`, {
      throttle: true,
      steer: 0,
      pitch: 0,
    });
  }
  await mobile.close();
  expect(errors).toEqual([]);
  console.log(
    `Input chords: ${samples.length} raw-controls/body-pitch observations passed; keyboard, both airbrake pairs, standard right-stick Y, real CDP two-finger pitch+steer and release.`,
  );
} finally {
  await writeFile(
    "test-artifacts/input-chords-report.json",
    JSON.stringify({ url, samples, errors }, null, 2),
  );
  await browser.close();
}
