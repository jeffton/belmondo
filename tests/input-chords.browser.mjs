import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack } from "../src/track.js";
import { getTrackPickups } from "../src/pickups.js";

const url = process.env.GAME_URL || "http://127.0.0.1:5188";
const gamepadOnly = process.env.INPUT_SCOPE === "gamepad";
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
async function ready(context, mode = "trial", trackIndex = 0) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator(`#tracks button:nth-child(${trackIndex + 1})`).click();
  await page.locator(`input[name="mode"][value="${mode}"]`).check();
  await page.locator("#quality").check();
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
    window.chordPad = { axes: [0, 0, 0, 0], buttons: [], values: {} };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [
        {
          axes: window.chordPad.axes,
          connected: true,
          mapping: "standard",
          buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: window.chordPad.buttons.includes(i),
            value:
              window.chordPad.values[i] ??
              (window.chordPad.buttons.includes(i) ? 1 : 0),
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
    window.chordPad.axes = [0.6, -0.75, 0, 0];
    window.chordPad.buttons = [0, 4, 5];
  });
  await controls(page, "gamepad-left-stick-up+steer+both-brakes", {
    throttle: true,
    steer: -0.6,
    pitch: 0.75,
    airLeft: 1,
    airRight: 1,
    air: 0,
  });
  await page.evaluate(() => {
    window.chordPad.axes = [-0.4, 0.65, 0, 0];
    window.chordPad.buttons = [];
  });
  await controls(page, "gamepad-left-stick-down+steer", {
    throttle: false,
    steer: 0.4,
    pitch: -0.65,
    air: 0,
  });
  await page.waitForFunction(() => window.nullVector.telemetry.pitch < -0.03);
  await page.evaluate(() => {
    window.chordPad.axes = [0.55, -0.7, -0.9, 0.85];
    window.chordPad.buttons = [1];
    window.chordPad.values = { 4: 0.4, 5: 0.8, 7: 0.65 };
  });
  await controls(page, "gamepad-two-axis+R2+analog-airbrakes+B", {
    throttle: true,
    steer: -0.55,
    pitch: 0.7,
    brake: true,
    airLeft: 0.4,
    airRight: 0.8,
    air: -0.4,
  });
  await page.waitForFunction(() => window.nullVector.telemetry.pitch > 0.03);
  await page.screenshot({
    path: "test-artifacts/gamepad-left-stick-chord.png",
  });
  await page.evaluate(() => {
    window.chordPad.axes = [0.12, -0.12, 0.85, -0.95];
    window.chordPad.buttons = [];
    window.chordPad.values = {};
  });
  await controls(page, "gamepad-deadzone-and-right-stick-ignored", {
    throttle: false,
    steer: 0,
    pitch: 0,
    brake: false,
    airLeft: 0,
    airRight: 0,
    air: 0,
  });
  await page.evaluate(() => {
    window.chordPad.axes = [0, 0, 0, 0];
    window.chordPad.buttons = [];
  });
  await page.screenshot({ path: "test-artifacts/hud-actual-desktop-race.png" });
  await page.locator("#pause").click();
  await page.waitForFunction(() => window.nullVector.telemetry.paused);
  await page.screenshot({
    path: "test-artifacts/hud-actual-desktop-pause.png",
  });
  await desktop.close();

  if (!gamepadOnly) {
    const mobile = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const touch = await ready(mobile);
    const cdp = await mobile.newCDPSession(touch);
    const pad = await touch.locator("#steer-pad").boundingBox();
    await expect(
      touch.locator('[data-control="pitchUp"], [data-control="pitchDown"]'),
    ).toHaveCount(0);
    const point = (id, x, y) => ({
      id,
      x: pad.x + pad.width * (0.5 + x * 0.4),
      y: pad.y + pad.height * (0.5 - y * 0.4),
    });
    const send = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    for (const [x, y] of [
      [0, 1],
      [0, -1],
      [-1, 0],
      [1, 0],
      [-0.75, 0.75],
      [0.75, -0.75],
    ]) {
      await send("touchStart", [point(1, x, y)]);
      await controls(touch, `CDP-stick-${x}-${y}`, {
        throttle: true,
        steer: -x,
        pitch: y,
      });
      await send("touchEnd", []);
      await controls(touch, "CDP-stick-release", { steer: 0, pitch: 0 });
    }
    // A second finger on the stick cannot steal or release the first finger.
    const owner = point(1, -0.75, 0.75);
    await send("touchStart", [owner]);
    await send("touchStart", [owner, point(2, 0.75, -0.75)]);
    await controls(touch, "CDP-stick-second-finger-ignored", {
      steer: 0.75,
      pitch: 0.75,
    });
    await send("touchEnd", [point(2, 0.75, -0.75)]);
    await controls(touch, "CDP-stick-nonowner-release", {
      steer: 0.75,
      pitch: 0.75,
    });
    await send("touchMove", [point(1, 0.5, -0.5)]);
    await controls(touch, "CDP-stick-owner-moves", {
      steer: -0.5,
      pitch: -0.5,
    });
    await send("touchCancel", []);
    await controls(touch, "CDP-stick-cancel", { steer: 0, pitch: 0 });

    const center = async (selector, id) => {
      const box = await touch.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const leftBrake = await center('[data-control="airLeft"]', 2);
    const rightBrake = await center('[data-control="airRight"]', 3);
    const fire = await center("#touch-fire", 4);
    await send("touchStart", [owner, leftBrake, rightBrake, fire]);
    await controls(touch, "CDP-four-finger-diagonal+both-brakes+fire", {
      steer: 0.75,
      pitch: 0.75,
      airLeft: 1,
      airRight: 1,
      air: 0,
    });
    await touch.screenshot({
      path: "test-artifacts/input-mobile-diagonal-chord.png",
    });
    await send("touchEnd", [fire]);
    samples.push({
      name: "CDP-fire-tap-during-chord",
      ...(await touch.evaluate(() => ({
        weapon: window.nullVector.telemetry.weapon,
        controls: window.nullVector.telemetry.controls,
      }))),
    });
    await send("touchCancel", []);
    await controls(touch, "CDP-all-cancel", {
      steer: 0,
      pitch: 0,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchStart", [owner, leftBrake, rightBrake]);
    await controls(touch, "CDP-before-blur", {
      steer: 0.75,
      pitch: 0.75,
      airLeft: 1,
      airRight: 1,
    });
    // Exercise browser blur cleanup explicitly; not a physical-device app switch.
    await touch.evaluate(() => window.dispatchEvent(new Event("blur")));
    await touch.waitForFunction(() => window.nullVector.telemetry.paused);
    await touch.locator("#resume").click();
    await controls(touch, "blur-cleared-on-resume", {
      steer: 0,
      pitch: 0,
      airLeft: 0,
      airRight: 0,
    });
    await send("touchCancel", []);
    await mobile.close();

    // Acquire inventory through normal race input, not app/simulation hooks.
    const armedContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    // Solar's opening pickup reaches the test before the technical fork.
    const armed = await ready(armedContext, "race", 1);
    const armedCdp = await armedContext.newCDPSession(armed);
    const armedPad = await armed.locator("#steer-pad").boundingBox();
    const brakeBox = await armed
      .locator('[data-control="brake"]')
      .boundingBox();
    const track = makeTrack(1);
    const authoredPickups = getTrackPickups(track);
    let touching = false,
      braking = false,
      equipped;
    const began = Date.now();
    while (Date.now() - began < 120000) {
      const t = await armed.evaluate(() => window.nullVector.telemetry);
      if (t.weapon) {
        equipped = t;
        break;
      }
      const look = track.frame(
        t.progress * track.length + Math.max(14, t.speed * 0.48),
      );
      const upcoming = authoredPickups.find(
        (pad) =>
          pad.type === "weapon" &&
          pad.branch === 0 &&
          pad.s > t.progress * track.length,
      );
      if (upcoming) {
        const distance = upcoming.s - t.progress * track.length;
        const approach = Math.max(0, Math.min(1, (140 - distance) / 70));
        look.p.addScaledVector(look.right, upcoming.lateral * approach);
      }
      const delta =
        Math.atan2(
          look.p.x - t.worldPosition[0],
          look.p.z - t.worldPosition[2],
        ) - t.yaw;
      const error = Math.atan2(Math.sin(delta), Math.cos(delta));
      const demand = error * 2.8 - t.yawRate * 0.32;
      const steer = Math.max(-1, Math.min(1, -demand));
      const nextBraking = t.speed > 70;
      if (braking !== nextBraking) {
        await armedCdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        touching = false;
        braking = nextBraking;
      }
      await armedCdp.send("Input.dispatchTouchEvent", {
        type: touching ? "touchMove" : "touchStart",
        touchPoints: [
          {
            id: 1,
            x: armedPad.x + armedPad.width * (0.5 + steer * 0.38),
            y: armedPad.y + armedPad.height * 0.5,
          },
          ...(braking
            ? [
                {
                  id: 2,
                  x: brakeBox.x + brakeBox.width / 2,
                  y: brakeBox.y + brakeBox.height / 2,
                },
              ]
            : []),
        ],
      });
      touching = true;
      await armed.waitForTimeout(80);
    }
    expect(
      equipped,
      "Normal race must acquire a weapon before the fire chord",
    ).toBeTruthy();
    samples.push({
      name: "natural-weapon-pickup",
      weapon: equipped.weapon,
      time: equipped.time,
      progress: equipped.progress,
      lateralPosition: equipped.lateralPosition,
    });
    await expect(armed.locator("#weapon")).toBeVisible();
    await armed.screenshot({
      path: "test-artifacts/hud-actual-mobile-equipped.png",
    });
    await expect(armed.locator("#weapon .weapon-name")).toHaveText(
      equipped.weapon,
    );
    await expect(armed.locator("#touch-fire")).toBeEnabled();
    await expect(armed.locator("#touch-fire")).toHaveAttribute(
      "aria-label",
      `Fire ${equipped.weapon}`,
    );
    await armedCdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const armedCenter = async (selector, id) => {
      const box = await armed.locator(selector).boundingBox();
      return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const fireFinger = await armedCenter("#touch-fire", 4);
    await armedCdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: armedPad.x + armedPad.width * 0.65,
          y: armedPad.y + armedPad.height * 0.35,
        },
        await armedCenter('[data-control="airLeft"]', 2),
        await armedCenter('[data-control="airRight"]', 3),
        fireFinger,
      ],
    });
    await controls(armed, "equipped-diagonal+both-brakes+fire", {
      steer: -0.375,
      pitch: 0.375,
      airLeft: 1,
      airRight: 1,
    });
    await armedCdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [fireFinger],
    });
    await armed.waitForFunction(
      () => window.nullVector.telemetry.weapon === null,
    );
    await expect(armed.locator("#weapon")).toBeHidden();
    await expect(armed.locator("#weapon")).toHaveText("");
    await expect(armed.locator("#touch-fire")).toBeVisible();
    await expect(armed.locator("#touch-fire")).toBeDisabled();
    samples.push({
      name: "fourth-finger-weapon-consumed",
      previousWeapon: equipped.weapon,
      ...(await armed.evaluate(() => ({
        weapon: window.nullVector.telemetry.weapon,
        time: window.nullVector.telemetry.time,
      }))),
    });
    await armedCdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await armed.screenshot({
      path: "test-artifacts/hud-actual-mobile-after-fire.png",
    });
    await armed.locator("#pause").click();
    await armed.waitForFunction(() => window.nullVector.telemetry.paused);
    await armed.screenshot({
      path: "test-artifacts/hud-actual-mobile-pause.png",
    });
    await armedContext.close();
  }
  expect(errors).toEqual([]);
  console.log(
    gamepadOnly
      ? `Input chords: ${samples.length} keyboard/gamepad observations passed; simultaneous left-stick X/Y, nose response, deadzone, right-stick independence, analog airbrakes, R2 thrust and B brake.`
      : `Input chords: ${samples.length} raw-controls/body-pitch observations passed; keyboard, both airbrake pairs, standard left-stick X/Y, real CDP two-axis stick, four-finger chords, ownership, release/cancel and blur cleanup.`,
  );
} finally {
  await writeFile(
    "test-artifacts/input-chords-report.json",
    JSON.stringify({ url, samples, errors }, null, 2),
  );
  await browser.close();
}
