import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack } from "../src/track.js";
import { mockInputApp } from "./helpers/input-app-mocks.mjs";
const inputMocks = process.env.INPUT_MOCKS === "1";

// Actual application input only. Telemetry is read; no Race state is assigned.
const url = process.env.GAME_URL || "http://127.0.0.1:5189";
const report = {
  url,
  method:
    "real keyboard/CDP touch/synthetic standard gamepad; read-only telemetry",
  cases: [],
  errors: [],
};
await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    ...(inputMocks
      ? ["--disable-gpu", "--disable-software-rasterizer"]
      : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
  ],
});
const read = (page) => page.evaluate(() => window.nullVector.telemetry);
async function at(page, countdown) {
  await page.waitForFunction(
    (countdown) => window.nullVector.telemetry.countdown <= countdown,
    countdown,
    { polling: 1 },
  );
  const state = await read(page);
  expect(state.countdown, "Input must still be in countdown").toBeGreaterThan(
    0,
  );
  expect(state.countdown).toBeGreaterThan(countdown - 0.1);
  return state;
}
async function hud(page, device) {
  await expect(page.locator("#thrust-system")).toBeVisible();
  await expect(page.locator(".launch-band")).toBeVisible();
  await expect(page.locator("#speed-bar").locator("..")).toBeVisible();
  await expect(page.locator("#lap-times")).toBeVisible();
  const result = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const band = document.querySelector(".launch-band");
    const meter = band.parentElement;
    return {
      bandLeft:
        (band.getBoundingClientRect().x -
          meter.getBoundingClientRect().x -
          meter.clientLeft) /
        meter.clientWidth,
      bandWidth: band.getBoundingClientRect().width / meter.clientWidth,
      lap: box("#lap-times"),
      view: box("#view"),
      pause: box("#pause"),
      thrust: box("#thrust-system"),
      speed: box("#speed-bar"),
      height: innerHeight,
      width: innerWidth,
    };
  });
  expect(result.bandLeft).toBeCloseTo(0.65, 1);
  expect(result.bandWidth).toBeCloseTo(0.15, 1);
  expect(result.lap.y).toBeGreaterThanOrEqual(0);
  expect(result.lap.bottom).toBeLessThan(result.height / 2);
  expect(result.lap.right).toBeLessThanOrEqual(result.width);
  for (const target of [result.view, result.pause]) {
    expect(
      Math.min(result.lap.right, target.right) >
        Math.max(result.lap.x, target.x) &&
        Math.min(result.lap.bottom, target.bottom) >
          Math.max(result.lap.y, target.y),
      `${device} lap timing overlaps camera/pause`,
    ).toBe(false);
  }
  return result;
}
async function open(device, heldFromMenu = false, viewport, label) {
  const touch = device === "touch";
  const context = await browser.newContext({
    viewport:
      viewport ||
      (process.env.LAUNCH_LAPS === "0"
        ? { width: 640, height: 400 }
        : touch
          ? { width: 844, height: 390 }
          : { width: 1000, height: 625 }),
    hasTouch: touch,
    isMobile: touch,
  });
  if (device === "controller")
    await context.addInitScript((held) => {
      window.launchPad = { thrust: held ? 1 : 0 };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [
          {
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, (_, i) => ({
              pressed: i === 7 && window.launchPad.thrust > 0.1,
              value: i === 7 ? window.launchPad.thrust : 0,
            })),
          },
        ],
      });
    }, heldFromMenu);
  await context.addInitScript(() => {
    window.launchEvents = [];
    const sampleSpeed = () => {
      const t = window.nullVector?.telemetry;
      if (t?.state === "race" && t.time >= 0.4 && !window.launchSpeedSample)
        window.launchSpeedSample = { time: t.time, speed: t.speed };
      requestAnimationFrame(sampleSpeed);
    };
    requestAnimationFrame(sampleSpeed);
    for (const type of ["keydown", "pointerdown", "pointerup", "pointercancel"])
      window.addEventListener(
        type,
        (event) => {
          const t = window.nullVector?.telemetry;
          if (t?.state === "race")
            window.launchEvents.push({
              type,
              code: event.code,
              pointerType: event.pointerType,
              countdown: t.countdown,
            });
        },
        true,
      );
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  if (inputMocks) await mockInputApp(page);
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#quality").check();
  if (device === "keyboard" && heldFromMenu) await page.keyboard.down("KeyW");
  if (label || (device === "keyboard" && !heldFromMenu))
    await page.screenshot({
      path: label
        ? `test-artifacts/launch-visual-${label}-menu.png`
        : "test-artifacts/launch-menu.png",
    });
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  return { context, page };
}
async function finish(page, success, name) {
  await page.waitForFunction(() => window.nullVector.telemetry.launch.resolved);
  const t = await read(page);
  if (t.launch.success !== success)
    console.log("Launch mismatch", name, JSON.stringify(t));
  expect(t.launch.success, name).toBe(success);
  expect(t.countdown).toBe(0);
  if (success) {
    expect(t.launch.level).toBeGreaterThanOrEqual(0.65);
    expect(t.launch.level).toBeLessThanOrEqual(0.8);
  }
  return t;
}
async function keyboardLapAfterLaunch(page, launchDevice) {
  if (launchDevice === "touch") {
    const touchSession = await page.context().newCDPSession(page);
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touchSession.detach();
    // Touch launched; the following lap deliberately switches to keyboard input.
    await page.keyboard.press("KeyW");
    await page.waitForFunction(
      () => !window.nullVector.telemetry.controls.launchIntent,
    );
  }
  const track = makeTrack(0),
    held = new Set(launchDevice === "keyboard" ? ["KeyW"] : []);
  const begun = Date.now();
  let t;
  while (Date.now() - begun < 90000) {
    t = await read(page);
    if (t.lap >= 2) break;
    const s = t.progress * track.length;
    const branch =
      t.branch ||
      (t.progress > track.config.split[0] - 0.035 &&
      t.progress < track.config.split[1]
        ? 1
        : 0);
    const look = track.frame(s + Math.max(18, t.speed * 0.55), branch);
    const error = Math.atan2(
      Math.sin(
        Math.atan2(
          look.p.x - t.worldPosition[0],
          look.p.z - t.worldPosition[2],
        ) - t.yaw,
      ),
      Math.cos(
        Math.atan2(
          look.p.x - t.worldPosition[0],
          look.p.z - t.worldPosition[2],
        ) - t.yaw,
      ),
    );
    const demand = error * 2.8 - t.yawRate * 0.32;
    const curve = Math.max(
      ...[0.25, 0.6, 0.95].map((ahead) =>
        Math.abs(track.curvature(s + t.speed * ahead, branch)),
      ),
    );
    const target = Math.min(150, Math.sqrt(80 / Math.max(curve, 0.0001)));
    const wanted = new Set();
    if (t.speed <= target + 4 && Math.abs(error) <= 0.7) wanted.add("KeyW");
    if (demand > 0.055) wanted.add("ArrowLeft");
    if (demand < -0.055) wanted.add("ArrowRight");
    if (Math.abs(error) > 0.38) wanted.add(error > 0 ? "KeyJ" : "KeyL");
    for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
    for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key);
    held.clear();
    for (const key of wanted) held.add(key);
    await page.waitForTimeout(65);
  }
  for (const key of held) await page.keyboard.up(key);
  expect(t.lap).toBeGreaterThanOrEqual(2);
  expect(t.lapTimes.length).toBeGreaterThan(0);
  expect(t.lapTimes[0]).toBeGreaterThan(0);
  await expect(page.locator("#lap-times")).toContainText("LAP 1");
  await expect(page.locator("#lap-times")).toContainText("CURRENT");
  await page.screenshot({
    path: `test-artifacts/launch-${launchDevice}-keyboard-piloted-lap.png`,
  });
  const layout = await page.evaluate(() => {
    const r = document.querySelector("#lap-times").getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      height: innerHeight,
      width: innerWidth,
      controls: ["#view", "#pause"].map((s) => {
        const c = document.querySelector(s).getBoundingClientRect();
        return { x: c.x, y: c.y, right: c.right, bottom: c.bottom };
      }),
    };
  });
  expect(layout.bottom).toBeLessThan(layout.height / 2);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  for (const control of layout.controls)
    expect(
      Math.min(layout.right, control.right) > Math.max(layout.x, control.x) &&
        Math.min(layout.bottom, control.bottom) > Math.max(layout.y, control.y),
      `${launchDevice} launch / keyboard-piloted lap rows overlap camera/pause`,
    ).toBe(false);
  return {
    launchDevice,
    pilotInput: "keyboard",
    layout,
    lap: t.lap,
    lapTimes: t.lapTimes,
    currentLapTime: t.currentLapTime,
  };
}
try {
  if (process.env.LAUNCH_SCOPE === "visual") {
    for (const [label, device, viewport] of [
      ["desktop", "keyboard", { width: 1440, height: 900 }],
      ["landscape", "touch", { width: 844, height: 390 }],
      ["portrait", "touch", { width: 390, height: 844 }],
    ]) {
      if (
        process.env.LAUNCH_VIEWS &&
        !process.env.LAUNCH_VIEWS.split(",").includes(label)
      )
        continue;
      const { context, page } = await open(device, false, viewport, label);
      const layout = await hud(page, device);
      await page.screenshot({
        path: `test-artifacts/launch-visual-${label}-countdown.png`,
      });
      expect(
        (await page.locator("#race-message").textContent()).trim(),
      ).not.toMatch(/^[1-3]$/);
      if (device === "touch") await page.locator("#pause").tap();
      else await page.keyboard.press("Escape");
      await expect(page.locator("#pause-panel")).toBeVisible();
      await page.screenshot({
        path: `test-artifacts/launch-visual-${label}-pause.png`,
      });
      for (const selector of [
        "#pause-panel",
        "#pause-panel .panel",
        "#pause-panel button",
      ]) {
        for (const element of await page.locator(selector).all()) {
          const bounds = await element.boundingBox();
          expect(
            bounds.x,
            `${label} ${selector} left clipped`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            bounds.x + bounds.width,
            `${label} ${selector} right clipped`,
          ).toBeLessThanOrEqual(viewport.width);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
        }
      }
      const fonts = await page.evaluate(() =>
        Object.fromEntries(
          ["#menu h1", "#pause-panel h2", "#hud"].map((selector) => [
            selector,
            getComputedStyle(document.querySelector(selector)).fontFamily,
          ]),
        ),
      );
      for (const font of Object.values(fonts))
        expect(font).toContain("Archivo");
      await page.locator("#resume").click();
      if (device === "keyboard") await page.keyboard.down("KeyW");
      await page.waitForFunction(() => window.nullVector.telemetry.time > 0.5);
      await page.screenshot({
        path: `test-artifacts/launch-visual-${label}-race.png`,
      });
      await expect(page.locator("#lap-times")).toBeVisible();
      await expect(page.locator("#thrust-system")).toBeVisible();
      await expect(page.locator("#speed-bar")).toBeVisible();
      report.cases.push({
        label,
        device,
        layout,
        fonts,
        running: await read(page),
      });
      await context.close();
    }
    console.log(
      `Launch final visuals: ${report.cases.map((c) => c.label).join("/")} production menu/countdown/pause/race and Archivo typography passed.`,
    );
  } else {
    for (const spec of [
      { name: "keyboard-idle", device: "keyboard", success: false },
      {
        name: "keyboard-held-from-menu",
        device: "keyboard",
        held: true,
        success: false,
      },
      {
        name: "controller-held-from-menu",
        device: "controller",
        held: true,
        success: false,
      },
      { name: "keyboard-timed", device: "keyboard", when: 0.58, success: true },
      { name: "keyboard-early", device: "keyboard", when: 1.2, success: false },
      { name: "keyboard-late", device: "keyboard", when: 0.15, success: false },
      {
        name: "controller-analog-timed",
        device: "controller",
        when: 0.725,
        amount: 0.8,
        success: true,
      },
      { name: "touch-idle", device: "touch", success: false },
      {
        name: "touch-coast-timed",
        device: "touch",
        when: 0.58,
        success: true,
      },
      {
        name: "touch-coast-early",
        device: "touch",
        when: 1.2,
        success: false,
      },
      {
        name: "touch-coast-lost-capture",
        device: "touch",
        when: 0.58,
        lostCapture: true,
        success: false,
      },
      {
        name: "touch-coast-late",
        device: "touch",
        when: 0.15,
        success: false,
      },
      {
        name: "touch-coast-cancel",
        device: "touch",
        when: 0.58,
        cancel: true,
        success: false,
      },
    ]) {
      if (
        process.env.LAUNCH_CASES &&
        !process.env.LAUNCH_CASES.split(",").includes(spec.name)
      )
        continue;
      const { context, page } = await open(spec.device, spec.held);
      const layout = await hud(page, spec.device);
      let press, release, numeric;
      if (spec.device === "touch" && spec.when) {
        const cdp = await context.newCDPSession(page);
        const box = await page.locator('[data-control="coast"]').boundingBox();
        const finger = {
          id: 1,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
        await page.locator('[data-control="coast"]').evaluate((button) => {
          button.addEventListener(
            "pointerdown",
            (event) => {
              button.testPointerId = event.pointerId;
            },
            { once: true },
          );
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [finger],
        });
        await page.waitForFunction(
          () =>
            window.nullVector.telemetry.controls.throttle === 0 &&
            !window.nullVector.telemetry.controls.launchIntent,
        );
        await at(page, spec.when);
        if (spec.cancel) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchCancel",
            touchPoints: [],
          });
        } else if (spec.lostCapture) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...finger, x: finger.x + 10 }],
          });
          await page
            .locator('[data-control="coast"]')
            .evaluate((button) =>
              button.releasePointerCapture(button.testPointerId),
            );
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...finger, x: finger.x + 11 }],
          });
          await page.waitForFunction(
            () =>
              !window.nullVector.telemetry.controls.launchIntent &&
              window.nullVector.telemetry.controls.throttle === 1,
          );
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        } else {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        }
        await page.waitForFunction((deliberate) => {
          const c = window.nullVector.telemetry.controls;
          return c.throttle === 1 && c.launchIntent === deliberate;
        }, !spec.cancel && !spec.lostCapture);
        release = await read(page);
        press = await page.evaluate(() =>
          window.launchEvents.findLast(
            (event) =>
              event.type === "pointerdown" && event.pointerType === "touch",
          ),
        );
        if (!spec.lostCapture) {
          const delivered = await page.evaluate(
            () =>
              window.launchEvents.findLast(
                (event) =>
                  event.pointerType === "touch" &&
                  ["pointerup", "pointercancel"].includes(event.type),
              ).countdown,
          );
          expect(delivered).toBeGreaterThan(spec.when - 0.1);
          expect(delivered).toBeLessThan(spec.when + 0.1);
        }
      } else if (spec.when) {
        press = await at(page, spec.when);
        if (spec.device === "keyboard") await page.keyboard.down("KeyW");
        else {
          await page.evaluate((amount) => {
            window.padSetCountdown = window.nullVector.telemetry.countdown;
            window.launchPad.thrust = amount;
          }, spec.amount);
          await page.waitForFunction(
            (amount) =>
              window.nullVector.telemetry.controls.throttle === amount,
            spec.amount,
          );
          numeric = (await read(page)).controls.throttle;
          expect(numeric).toBe(spec.amount);
        }
        const delivered = await page.evaluate(
          (device) =>
            device === "keyboard"
              ? window.launchEvents.findLast(
                  (event) => event.type === "keydown" && event.code === "KeyW",
                ).countdown
              : window.padSetCountdown,
          spec.device,
        );
        expect(delivered).toBeGreaterThan(spec.when - 0.1);
        expect(delivered).toBeGreaterThan(0);
      }
      if (spec.success) {
        await at(page, 0.2);
        await expect(page.locator(".launch-band")).toBeVisible();
        expect(
          await page
            .locator("#thrust-bar")
            .evaluate((el) => el.getBoundingClientRect().width),
        ).toBeGreaterThan(0);
        await page.screenshot({
          path: `test-artifacts/launch-countdown-${spec.device}.png`,
        });
      }
      const result = await finish(page, spec.success, spec.name);
      if (["keyboard-early", "touch-coast-early"].includes(spec.name))
        expect(result.launch.level).toBeGreaterThan(0.8);
      if (["keyboard-late", "touch-coast-late"].includes(spec.name))
        expect(result.launch.level).toBeLessThan(0.65);
      if (
        [
          "keyboard-idle",
          "keyboard-held-from-menu",
          "controller-held-from-menu",
          "touch-idle",
          "touch-coast-cancel",
          "touch-coast-lost-capture",
        ].includes(spec.name)
      )
        expect(result.launch.level).toBe(0);
      await page.waitForFunction(() => window.nullVector.telemetry.time > 0.4);
      const running = await read(page);
      await page.waitForFunction(() => window.launchSpeedSample);
      const accelerationSample = await page.evaluate(
        () => window.launchSpeedSample,
      );
      expect(accelerationSample.time).toBeGreaterThanOrEqual(0.4);
      expect(accelerationSample.time).toBeLessThan(0.5);
      expect(typeof running.controls.throttle).toBe("boolean");
      if (spec.success || spec.name === "touch-coast-early")
        expect(
          await page
            .locator("#speed-bar")
            .evaluate((el) => el.getBoundingClientRect().width),
        ).toBeGreaterThan(0);
      expect(running.currentLapTime).toBeGreaterThan(0);
      await expect(page.locator("#lap-times .current b")).not.toHaveText(
        "00:00.00",
      );
      if (spec.success || spec.name === "touch-coast-early")
        await page.screenshot({
          path: `test-artifacts/launch-${spec.name}.png`,
        });
      const completed =
        process.env.LAUNCH_LAPS !== "0" &&
        ["keyboard-timed", "touch-coast-timed"].includes(spec.name)
          ? await keyboardLapAfterLaunch(page, spec.device)
          : null;
      if (spec.success) {
        await page.keyboard.press("Escape");
        await expect(page.locator("#pause-panel")).toBeVisible();
        await page.screenshot({
          path: `test-artifacts/launch-pause-${spec.device}.png`,
        });
      }
      report.cases.push({
        ...spec,
        layout,
        press,
        release,
        numeric,
        result,
        running,
        accelerationSample,
        completed,
      });
      console.log(
        spec.name,
        JSON.stringify({
          launch: result.launch,
          press: press?.countdown,
          release: release?.countdown,
          speed: running.speed,
          lap: completed?.lapTimes,
        }),
      );
      await context.close();
    }
    for (const [success, control] of [
      ["keyboard-timed", "keyboard-early"],
      ["controller-analog-timed", "keyboard-early"],
      ["touch-coast-timed", "touch-coast-early"],
    ]) {
      const successCase = report.cases.find((c) => c.name === success);
      const controlCase = report.cases.find((c) => c.name === control);
      if (!successCase || !controlCase) continue;
      const won = successCase.accelerationSample;
      const lost = controlCase.accelerationSample;
      expect(
        won.speed / won.time,
        `${success} must earn acceleration above equal-throttle ${control}`,
      ).toBeGreaterThan((lost.speed / lost.time) * 1.25);
    }
    expect(report.errors).toEqual([]);
    console.log(
      `Launch: ${report.cases.length} actual-input timing cases; ${report.cases.filter((c) => c.completed).length} keyboard-piloted completed laps passed (launch input recorded separately).`,
    );
  }
} finally {
  await writeFile(
    `test-artifacts/${process.env.LAUNCH_REPORT || "launch-report.json"}`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
