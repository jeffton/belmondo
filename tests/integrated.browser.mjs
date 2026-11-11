import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack } from "../src/track.js";

// Actual app UI/input only; telemetry is never assigned. The UI-only scope seeds
// local-record fixtures in a fresh browser profile, never in the user's storage.
const url = process.env.GAME_URL || "http://127.0.0.1:5189";
const scope = process.env.INTEGRATED_SCOPE || "ui";
const report = {
  url,
  scope,
  method: "actual app input/read-only telemetry",
  cases: [],
  errors: [],
};
await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const telemetry = (page) => page.evaluate(() => window.nullVector.telemetry);
async function open(device, seedRecords = false) {
  const mobile = device === "touch";
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1000, height: 625 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  if (seedRecords)
    await context.addInitScript((mode) => {
      const records = {"0-0-trial":0.1,"0-0-trial-c2-5laps":222.22,"0-0-trial-c3-5laps":333.33};
      if (mode !== "drive") records["0-0-trial-c1-5laps"] = 111.11;
      localStorage.setItem("nv-records",JSON.stringify(records));
    },seedRecords);
  if (device === "controller")
    await context.addInitScript(() => {
      window.qaPad = { axes: [0, 0, 0, 0], buttons: [] };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [
          {
            axes: window.qaPad.axes,
            buttons: Array.from({ length: 17 }, (_, i) => ({
              pressed: window.qaPad.buttons.includes(i),
              value: window.qaPad.buttons.includes(i) ? 1 : 0,
            })),
          },
        ],
      });
    });
  if (scope === "pace")
    await context.addInitScript(() => {
      const sample = () => {
        const t = window.nullVector?.telemetry;
        if (t?.state === "race" && t.time >= 1 && !window.qaPaceSample)
          window.qaPaceSample = {
            time: t.time,
            speed: t.speed,
            launch: t.launch,
          };
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  if (scope === "public")
    await context.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.qaAudio = [];
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args);
        window.qaAudio.push(audio);
        return audio;
      };
    });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(url);
  report.scripts = await page.locator("script[src]").evaluateAll((scripts) => scripts.map((script) => script.src));
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#quality").check();
  return { context, page };
}
async function chooseClass(page, value, device) {
  const selector = page.locator("#speed-class");
  if (device === "keyboard") {
    await selector.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < value; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
  } else await selector.selectOption(String(value));
  await expect(selector).toHaveValue(String(value));
}
async function start(page) {
  await page.locator("#start").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
}
async function input(page, context, device) {
  if (device === "keyboard") {
    for (const key of ["KeyW", "KeyD", "KeyK", "KeyJ"])
      await page.keyboard.down(key);
    await page.waitForFunction(() => {
      const c = window.nullVector.telemetry.controls;
      return c.throttle && c.steer === -1 && c.pitch === -1 && c.airLeft === 1;
    });
    for (const key of ["KeyW", "KeyD", "KeyK", "KeyJ"])
      await page.keyboard.up(key);
  } else if (device === "controller") {
    await page.evaluate(() => {
      window.qaPad.axes = [0.45, -0.6, 0, 0];
      window.qaPad.buttons = [0, 4];
    });
    await page.waitForFunction(() => {
      const c = window.nullVector.telemetry.controls;
      return (
        c.throttle && c.steer === -0.45 && c.pitch === 0.6 && c.airLeft === 1
      );
    });
    await page.evaluate(() => {
      window.qaPad.axes = [0, 0, 0, 0];
      window.qaPad.buttons = [];
    });
  } else {
    const session = await context.newCDPSession(page),
      box = await page.locator("#steer-pad").boundingBox();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 },
      ],
    });
    await page.waitForFunction(() => {
      const c = window.nullVector.telemetry.controls;
      return (
        c.throttle &&
        Math.abs(c.steer + 0.25) < 0.001 &&
        Math.abs(c.pitch - 0.25) < 0.001
      );
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  }
}
async function publicSmoke() {
  const { context, page } = await open("keyboard");
  await expect(page.locator("#tracks button")).toHaveCount(3);
  await expect(page.locator("#crafts button")).toHaveCount(3);
  await start(page);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => window.nullVector.telemetry.speed > 65);
  await page.waitForFunction(() =>
    window.qaAudio.some(
      (audio) =>
        audio.src.includes("/music/") &&
        !audio.paused &&
        audio.currentTime > 0.05,
    ),
  );
  const music = await page.evaluate(() =>
    window.qaAudio
      .filter((audio) => audio.src.includes("/music/"))
      .map((audio) => ({
        src: audio.src,
        paused: audio.paused,
        currentTime: audio.currentTime,
      })),
  );
  await page.keyboard.up("KeyW");
  await page.locator("#pause").click();
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.waitForFunction(() =>
    window.qaAudio.every((audio) => audio.paused),
  );
  await page.screenshot({ path: "test-artifacts/integrated-public-pause.png" });
  report.cases.push({ public: await telemetry(page), music });
  await context.close();
}
async function ui() {
  for (const device of ["keyboard", "touch", "controller"].filter((device) => !process.env.INTEGRATED_DEVICES || process.env.INTEGRATED_DEVICES.split(",").includes(device))) {
    const { context, page } = await open(device, true);
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      face: [...document.fonts].some(
        (face) =>
          face.family.replaceAll('"', "") === "Belmondo Circuit" &&
          face.status === "loaded",
      ),
      families: ["#menu h1", "#position", "#speed"].map((selector) =>
        getComputedStyle(document.querySelector(selector))
          .fontFamily.split(",")[0]
          .replaceAll('"', "")
          .trim(),
      ),
    }));
    expect(fonts.face).toBe(true);
    expect(fonts.families).toEqual([
      "Belmondo Circuit",
      "Belmondo Circuit",
      "Belmondo Circuit",
    ]);
    await expect(page.locator("#speed-class option")).toHaveCount(3);
    await page.locator("#mode").selectOption("trial");
    for (const speedClass of [0, 1, 2].filter((speedClass) => !process.env.INTEGRATED_CLASSES || process.env.INTEGRATED_CLASSES.split(",").includes(String(speedClass)))) {
      await chooseClass(page, speedClass, device);
      await expect(page.locator("#best")).toHaveText(
        [
          "LOCAL RECORD / 01:51.11",
          "LOCAL RECORD / 03:42.22",
          "LOCAL RECORD / 05:33.33",
        ][speedClass],
      );
      // Craft and class are independent: changing craft must not change class.
      await page.locator("#crafts button").nth(1).click();
      await expect(page.locator("#speed-class")).toHaveValue(
        String(speedClass),
      );
      await expect(page.locator("#best")).toHaveText("LOCAL RECORD / —");
      await page.locator("#crafts button").first().click();
      await start(page);
      const before = await telemetry(page);
      expect(before.speedClass).toBe(speedClass);
      expect(before.classId).toBe(`c${speedClass + 1}`);
      expect(before.laps).toBe(5);
      await expect(page.locator("#hud-track")).toContainText(
        `C${speedClass + 1}`,
      );
      await expect(page.locator("#lap small")).toHaveText("/5");
      await input(page, context, device);
      await page.screenshot({
        path: `test-artifacts/integrated-${device}-c${speedClass + 1}.png`,
      });
      await page.locator("#pause").click();
      await page.locator("#quit").click();
      await expect(page.locator("#menu")).toBeVisible();
      let menuBounds;
      if (device === "keyboard") {
        menuBounds = await page.evaluate(() => ({
          scrollTop: document.querySelector("#menu").scrollTop,
          elements: [".masthead", ".wordmark", "#start", "#menu footer"].map(
            (selector) => {
              const r = document
                .querySelector(selector)
                .getBoundingClientRect();
              return {
                selector,
                x: r.x,
                y: r.y,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
              };
            },
          ),
        }));
        expect(menuBounds.scrollTop).toBe(0);
        for (const r of menuBounds.elements) {
          expect(r.width * r.height).toBeGreaterThan(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.bottom).toBeLessThanOrEqual(625);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(1000);
        }
      }
      report.cases.push({ device, speedClass, before, fonts, menuBounds });
    }
    if (device !== "controller") {
      for (const [course, name] of [
        "KAISEKI COAST",
        "SOLAR ARRAY",
        "NOCTILUCENT",
      ].entries()) {
        await page.locator("#tracks button").nth(course).click();
        await expect(page.locator("#circuit-name")).toHaveText(name);
        await page.waitForTimeout(350);
        await page.screenshot({
          path: `test-artifacts/integrated-${device}-terrain-course${course}.png`,
        });
      }
    }
    await context.close();
  }
  const portrait = await open("touch");
  await portrait.page.setViewportSize({ width: 390, height: 844 });
  await expect(portrait.page.locator("#speed-class")).toBeVisible();
  const bounds = await portrait.page.locator("#start").boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await portrait.page.screenshot({
    path: "test-artifacts/integrated-portrait-menu.png",
  });
  await portrait.context.close();
}
async function pace() {
  const cases = [];
  for (const speedClass of [0, 1, 2]) {
    const { context, page } = await open("keyboard");
    await page.locator("#mode").selectOption("trial");
    await chooseClass(page, speedClass, "keyboard");
    await page.locator("#start").click();
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.qaPaceSample);
    const sample = await page.evaluate(() => window.qaPaceSample);
    expect(sample.time).toBeGreaterThanOrEqual(1);
    expect(sample.time).toBeLessThan(1.1);
    expect(sample.launch.success).toBe(false);
    cases.push({ speedClass, ...sample });
    await page.keyboard.up("KeyW");
    await context.close();
  }
  expect(cases[1].speed / cases[1].time).toBeGreaterThan(
    (cases[0].speed / cases[0].time) * 1.1,
  );
  expect(cases[2].speed / cases[2].time).toBeGreaterThan(
    (cases[1].speed / cases[1].time) * 1.1,
  );
  report.cases.push(...cases);
}
async function menuSplit() {
  const { context, page } = await open("keyboard");
  const track = makeTrack(0),
    [start, end] = track.config.split;
  const initialIds = (await telemetry(page)).menuRacers.map((r) => r.id);
  expect(initialIds).toHaveLength(8);
  await page.waitForFunction(
    ([start, length]) =>
      window.nullVector.telemetry.menuRacers.some(
        (r) => r.s / length > start - 0.02,
      ),
    [start, track.length],
    { timeout: 90000 },
  );
  const visited = new Map(),
    previous = new Map(),
    branches = new Set(),
    samples = [];
  let captured = false;
  const begun = Date.now();
  while (Date.now() - begun < 90000) {
    const t = await telemetry(page);
    expect(t.state).toBe("menu");
    expect(t.menuRacers.map((r) => r.id)).toEqual(initialIds);
    for (const racer of t.menuRacers) {
      const u = racer.s / track.length;
      const f = track.frame(racer.s, racer.branch);
      const expected = f.p
        .clone()
        .addScaledVector(f.right, racer.x)
        .addScaledVector(f.up, 1.6);
      expect(
        Math.hypot(...racer.position.map((v, i) => v - expected.toArray()[i])),
        `Menu racer ${racer.id} must hover above its actual route`,
      ).toBeLessThan(0.1);
      const seen = visited.get(racer.id) || {
        before: false,
        inside: false,
        after: false,
      };
      if (u < start) seen.before = true;
      if (u > start + 0.005 && u < end - 0.005) {
        expect([-1, 1]).toContain(racer.branch);
        branches.add(racer.branch);
        seen.inside = true;
      }
      if (u > end) {
        expect(racer.branch).toBe(0);
        seen.after = true;
      }
      visited.set(racer.id, seen);
      const last = previous.get(racer.id);
      if (last)
        expect(
          Math.hypot(...racer.position.map((v, i) => v - last.position[i])),
          `Menu racer ${racer.id} split/rejoin discontinuity`,
        ).toBeLessThan((racer.s - last.s) * 1.6 + 1);
      previous.set(racer.id, racer);
    }
    samples.push(t.menuRacers);
    if (!captured && t.progress > start + 0.03) {
      captured = true;
      await page.screenshot({
        path: "test-artifacts/integrated-actual-menu-split.png",
      });
    }
    if (t.menuRacers.every((r) => r.s / track.length > end + 0.02)) break;
    await page.waitForTimeout(120);
  }
  expect([...branches].sort()).toEqual([-1, 1]);
  for (const [id, seen] of visited)
    expect(
      seen,
      `Menu racer ${id} must traverse entry, route and rejoin`,
    ).toEqual({ before: true, inside: true, after: true });
  await page.screenshot({
    path: "test-artifacts/integrated-actual-menu-rejoin.png",
  });
  report.cases.push({ menuRacers: [...visited], samples });
  await context.close();
}
async function drive() {
  const { context, page } = await open("keyboard", "drive");
  await page.locator("#mode").selectOption("trial");
  await chooseClass(page, 0, "keyboard");
  await start(page);
  const track = makeTrack(0),
    held = new Set(),
    samples = [];
  const began = Date.now();
  let t, capturedLap = 0;
  while (Date.now() - began < 420000) {
    t = await telemetry(page);
    if (t.state === "results") break;
    if (t.lap > capturedLap) { capturedLap = t.lap; await page.screenshot({path:`test-artifacts/integrated-actual-lap${t.lap}.png`}); }
    const s = (t.lap - 1 + t.progress) * track.length;
    const plannedBranch = t.lap % 2 ? -1 : 1;
    const branch =
      t.branch ||
      (t.progress > track.config.split[0] - 0.04 &&
      t.progress < track.config.split[1] + 0.02
        ? plannedBranch
        : 0);
    const look = track.frame(s + Math.max(14, t.speed * 0.48), branch);
    const delta =
      Math.atan2(look.p.x - t.worldPosition[0], look.p.z - t.worldPosition[2]) -
      t.yaw;
    const error = Math.atan2(Math.sin(delta), Math.cos(delta));
    const demand = error * 2.8 - t.yawRate * 0.32;
    const curve = Math.max(
      ...[0.25, 0.6, 0.95].map((ahead) =>
        Math.abs(track.curvature(s + t.speed * ahead, branch)),
      ),
    );
    const target = Math.min(150, Math.sqrt(80 / Math.max(curve, 0.0001)));
    const wanted = new Set(["KeyW"]);
    if (demand > 0.055) wanted.add("ArrowLeft");
    if (demand < -0.055) wanted.add("ArrowRight");
    if (t.speed > target + 4 || Math.abs(error) > 0.7) wanted.add("ArrowDown");
    if (Math.abs(error) > 0.38) wanted.add(error > 0 ? "KeyQ" : "KeyE");
    for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
    for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key);
    held.clear();
    for (const key of wanted) held.add(key);
    samples.push({
      time: t.time,
      lap: t.lap,
      progress: t.progress,
      branch: t.branch,
      grounded: t.grounded,
      shield: t.shield,
      roll: t.roll,
      yawRate: t.yawRate,
    });
    if (samples.length % 100 === 0)
      console.log("INTEGRATED DRIVE", JSON.stringify(samples.at(-1)));
    await page.waitForTimeout(65);
  }
  for (const key of held) await page.keyboard.up(key);
  expect(t.state).toBe("results");
  expect(t.lapTimes).toHaveLength(5);
  expect(t.lapTimes.every((v) => v > 0)).toBe(true);
  expect(Math.abs(t.lapTimes.reduce((a, b) => a + b, 0) - t.time)).toBeLessThan(
    0.1,
  );
  for (let lap = 1; lap <= 5; lap++)
    await expect(page.locator("#result-data")).toContainText(`LAP / ${lap}`);
  await expect(page.locator("#result-data")).toContainText("C1 / 5 LAPS");
  await page.screenshot({
    path: "test-artifacts/integrated-actual-five-lap-results.png",
  });
  for (const [label, viewport] of [["landscape", {width:844,height:390}], ["portrait", {width:390,height:844}]]) {
    await page.setViewportSize(viewport);
    const panel = await page.locator("#results .panel").boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x+panel.width).toBeLessThanOrEqual(viewport.width);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({path:`test-artifacts/integrated-actual-five-lap-results-${label}-resize.png`});
    await page.locator("#result-quit").scrollIntoViewIfNeeded();
    const quit = await page.locator("#result-quit").boundingBox();
    expect(quit.y).toBeGreaterThanOrEqual(0);
    expect(quit.y+quit.height).toBeLessThanOrEqual(viewport.height);
  }
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nv-records")),
  );
  expect(records["0-0-trial-c1-5laps"]).toBeCloseTo(t.time, 4);
  expect(records["0-0-trial"]).toBe(0.1);
  expect(records["0-0-trial-c2-5laps"]).toBe(222.22);
  expect(records["0-0-trial-c3-5laps"]).toBe(333.33);
  await page.locator("#result-quit").click();
  await chooseClass(page, 1, "keyboard");
  await expect(page.locator("#best")).toHaveText("LOCAL RECORD / 03:42.22");
  report.cases.push({
    result: t,
    records,
    samples,
    method:
      "five natural keyboard-input laps, alternating split routes; no state injection",
  });
  await context.close();
}
try {
  if (scope === "public") await publicSmoke();
  else if (scope === "ui") await ui();
  else if (scope === "pace") await pace();
  else if (scope === "menu") await menuSplit();
  else if (scope === "drive") await drive();
  else throw new Error(`Unknown integrated scope: ${scope}`);
  expect(report.errors).toEqual([]);
  console.log(`Integrated ${scope}: ${report.cases.length} cases passed.`);
} finally {
  await writeFile(
    `test-artifacts/integrated-${scope}-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
