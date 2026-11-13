import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack, TRACKS } from "../src/track.js";
import { SPEED_CLASSES } from "../src/speed-classes.js";

const recordKey = (layoutId, classId, craft = 0) =>
  `${layoutId}-${craft}-trial-${classId}-5laps-pace${SPEED_CLASSES.find((spec) => spec.id === classId).pace}`;
const preservedRecords = {
  "0-0-trial": 0.1,
  "0-0-trial-c1-5laps": 0.2,
  "0-0-trial-c2-5laps": 0.3,
  "0-0-trial-c3-5laps": 0.4,
  "coast-2-0-trial-c2-5laps": 222.22,
  "coast-2-0-trial-c3-5laps": 333.33,
  "solar-2-0-trial-c1-5laps": 444.44,
  "noctilucent-2-0-trial-c1-5laps": 555.55,
};
function validateLayout(t, track) {
  expect(t.layoutId).toBe(track.config.layoutId);
  expect(t.trackLength).toBeCloseTo(track.length, 4);
}
function validateMotion(previous, current, track) {
  const before = (previous.lap - 1 + previous.progress) * track.length;
  const after = (current.lap - 1 + current.progress) * track.length;
  const dt = current.time - previous.time;
  expect(dt).toBeGreaterThanOrEqual(0);
  const speed = Math.max(
    Math.hypot(...previous.velocity),
    Math.hypot(...current.velocity),
  );
  const movement = Math.hypot(
    ...current.worldPosition.map((v, i) => v - previous.worldPosition[i]),
  );
  const metric = Math.min(
    ...[before, (before + after) / 2, after].map(
      (s) => track.frame(s, current.branch).metric,
    ),
  );
  // Race's road-contact window permits a local correction of up to three metres.
  // A station may not jump to a remote crossing segment or recover backwards.
  expect(
    after - before,
    "Station advance must match physical movement/time",
  ).toBeLessThanOrEqual(Math.max(movement, speed * dt) / metric + 3);
  expect(
    before - after,
    "No backwards checkpoint teleport during the driven route",
  ).toBeLessThanOrEqual((speed * dt) / metric + 3);
  const verticalSpeed = Math.max(
    Math.abs(previous.velocity[1]),
    Math.abs(current.velocity[1]),
  );
  expect(
    Math.abs(current.worldPosition[1] - previous.worldPosition[1]),
    "No vertical snap between crossing decks or across a landing",
  ).toBeLessThanOrEqual(verticalSpeed * dt + 3);
}

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
async function open(
  device,
  recordMode = "none",
  activeLayout = TRACKS[0].layoutId,
  activeClass = "c1",
) {
  const mobile = device === "touch";
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1000, height: 625 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  if (recordMode !== "none")
    await context.addInitScript(
      ({ mode, records, activeKey, uiKey }) => {
        if (mode === "ui") records[uiKey] = 111.11;
        if (mode === "drive") delete records[activeKey];
        localStorage.setItem("nv-records", JSON.stringify(records));
      },
      {
        mode: recordMode,
        records: preservedRecords,
        activeKey: recordKey(activeLayout, activeClass),
        uiKey: recordKey(activeLayout, "c1"),
      },
    );
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
  if (scope === "drive")
    await context.addInitScript(() => {
      window.qaMotion = [];
      let previous;
      const trace = () => {
        const t = window.nullVector?.telemetry;
        if (t && (t.state === "race" || t.state === "results")) {
          const frame = {
            state: t.state,
            time: t.time,
            lap: t.lap,
            progress: t.progress,
            branch: t.branch,
            grounded: t.grounded,
            height: t.height,
            shield: t.shield,
            worldPosition: t.worldPosition,
            velocity: t.velocity,
            lateralPosition: t.lateralPosition,
          };
          if (
            !previous ||
            frame.time !== previous.time ||
            frame.state !== previous.state ||
            frame.worldPosition.some((v, i) => v !== previous.worldPosition[i])
          ) {
            window.qaMotion.push(frame);
            previous = frame;
          }
        }
        requestAnimationFrame(trace);
      };
      requestAnimationFrame(trace);
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
  report.scripts = await page
    .locator("script[src]")
    .evaluateAll((scripts) => scripts.map((script) => script.src));
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#quality").check();
  return { context, page };
}
async function chooseClass(page, value, device) {
  const selected = page.locator('input[name="speed-class"]:checked');
  const target = page.locator(`input[name="speed-class"][value="${value}"]`);
  if (device === "keyboard") {
    await selected.focus();
    const previous = Number(await selected.inputValue());
    for (let i = 0; i < (value - previous + 3) % 3; i++)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Tab");
  } else await target.check();
  await expect(target).toBeChecked();
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
      box = await page.locator("#steer-pad").boundingBox(),
      thrust = await page.locator('[data-control="thrust"]').boundingBox();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 },
        {
          id: 2,
          x: thrust.x + thrust.width / 2,
          y: thrust.y + thrust.height / 2,
        },
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
async function publicSmoke(device) {
  const { context, page } = await open(device);
  await expect(page.locator("#tracks button")).toHaveCount(3);
  await expect(page.locator("#crafts button")).toHaveCount(3);
  await expect(page.locator("#speed-class input")).toHaveCount(3);
  await chooseClass(page, 2, device);
  await start(page);
  expect((await telemetry(page)).speedClass).toBe(2);
  expect((await telemetry(page)).laps).toBe(5);
  await expect(page.locator("#hud-track")).toContainText("C3");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        (face) =>
          face.family.replaceAll('"', "") === "Belmondo Circuit" &&
          face.status === "loaded",
      ),
    ),
  ).toBe(true);
  if (device === "keyboard") await page.keyboard.down("KeyW");
  else await input(page, context, device);
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
  if (device === "keyboard") {
    await page.keyboard.up("KeyW");
    await page.keyboard.press("Escape");
  } else {
    await page.locator("#pause").tap();
  }
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.waitForFunction(() =>
    window.qaAudio.every((audio) => audio.paused),
  );
  await page.screenshot({
    path: `test-artifacts/integrated-public-${device}-pause.png`,
  });
  report.cases.push({ device, public: await telemetry(page), music });
  await context.close();
}
async function ui() {
  for (const device of ["keyboard", "touch", "controller"].filter(
    (device) =>
      !process.env.INTEGRATED_DEVICES ||
      process.env.INTEGRATED_DEVICES.split(",").includes(device),
  )) {
    const { context, page } = await open(device, "ui");
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
    await expect(page.locator("#speed-class input")).toHaveCount(3);
    await page.locator('input[name="mode"][value="trial"]').check();
    for (const speedClass of [0, 1, 2].filter(
      (speedClass) =>
        !process.env.INTEGRATED_CLASSES ||
        process.env.INTEGRATED_CLASSES.split(",").includes(String(speedClass)),
    )) {
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
      await expect(
        page.locator('input[name="speed-class"]:checked'),
      ).toHaveValue(String(speedClass));
      await expect(page.locator("#best")).toHaveText("LOCAL RECORD / —");
      await page.locator("#crafts button").first().click();
      await start(page);
      const before = await telemetry(page);
      validateLayout(before, makeTrack(0));
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
      if (device === "touch") await page.locator("#pause").tap();
      else await page.keyboard.press("Escape");
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
    await page.locator('input[name="mode"][value="trial"]').check();
    await chooseClass(page, speedClass, "keyboard");
    await page.locator("#start").click();
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.qaPaceSample);
    const sample = await page.evaluate(() => window.qaPaceSample);
    validateLayout(await telemetry(page), makeTrack(0));
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
  validateLayout(await telemetry(page), track);
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
async function finishFixture() {
  // Isolated renderer fixture only, not application driving or a Race shortcut.
  const context = await browser.newContext({
    viewport: { width: 1000, height: 625 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/__finish_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__finish_fixture__.html`);
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world.js")).text();
    const threeModule = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
      await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import(threeModule),
      ]);
    const world = new World(document.querySelector("canvas"));
    world.quality = "retro";
    world.resize();
    const loaded = new Promise((resolve, reject) => {
      THREE.DefaultLoadingManager.onLoad = resolve;
      THREE.DefaultLoadingManager.onError = (asset) => reject(Error(asset));
    });
    world.build(makeTrack(0));
    await loaded;
    window.finishFixture = { world, Race, CRAFT, makeTrack, THREE };
  });
  for (const course of [0, 1, 2]) {
    const state = await page.evaluate(async (course) => {
      const f = window.finishFixture,
        track = f.makeTrack(course);
      let loading = false;
      let complete;
      const loaded = new Promise((resolve, reject) => {
        complete = resolve;
        f.THREE.DefaultLoadingManager.onStart = () => (loading = true);
        f.THREE.DefaultLoadingManager.onLoad = resolve;
        f.THREE.DefaultLoadingManager.onError = (asset) => reject(Error(asset));
      });
      f.world.build(track);
      const race = new f.Race(
        track,
        0,
        "trial",
        0,
        f.world.environment.terrain,
      );
      f.world.setupRacers(race, f.CRAFT);
      if (!loading) complete();
      await loaded;
      const p = race.player,
        road = track.frame(
          track.length * (track.config.sections.finishStraight[0] - 0.01),
        );
      p.s = p.contactS =
        track.length * (track.config.sections.finishStraight[0] - 0.01);
      p.position.copy(road.p).addScaledVector(road.up, 2.2);
      p.yaw = Math.atan2(road.tangent.x, road.tangent.z);
      p.speed = 100;
      f.world.draw(race, 0);
      const district = f.world.scene.getObjectByName("finish-district");
      let instances = 0;
      district?.traverse((object) => {
        if (object.isInstancedMesh) instances += object.count;
      });
      f.race = race;
      f.track = track;
      return {
        course,
        layoutId: track.config.layoutId,
        district: !!district,
        instances,
        checkerRange: district.getObjectByName("finish-straight-checker")
          .userData.range,
        finishStraight: track.config.sections.finishStraight,
        method:
          "isolated real World/Race placements derived from finishStraight; not driven",
      };
    }, course);
    expect(state.district).toBe(true);
    expect(state.instances).toBeGreaterThan(0);
    expect(state.checkerRange).toEqual(state.finishStraight);
    for (const [pose, ratio] of [
      ["approach", -1],
      ["middle", 0.5],
      ["end", 1],
    ]) {
      await page.evaluate(
        ({ pose, ratio }) => {
          const f = window.finishFixture,
            [start, end] = f.track.config.sections.finishStraight;
          const u =
            pose === "approach"
              ? start - 0.01
              : pose === "end"
                ? end - 0.005
                : start + (end - start) * ratio;
          const road = f.track.frame(f.track.length * u),
            p = f.race.player;
          p.s = p.contactS = f.track.length * u;
          p.position.copy(road.p).addScaledVector(road.up, 2.2);
          p.yaw = Math.atan2(road.tangent.x, road.tangent.z);
          f.world.cameraReady = false;
          f.world.cameraForward = null;
          f.world.draw(f.race, 0);
        },
        { pose, ratio },
      );
      await page.screenshot({
        path: `test-artifacts/integrated-finish-fixture-${state.layoutId}-${pose}.png`,
      });
    }
    const features = await page.evaluate(() => {
      const f = window.finishFixture,
        c = f.track.config;
      if (c.name === "KAISEKI COAST")
        return [
          { name: "coast-ads", u: 0.187 },
          { name: "coast-sloped-ramp", u: c.jump - c.ramp.length / 2 },
        ];
      if (c.name === "SOLAR ARRAY")
        return [
          { name: "solar-portal", u: c.sections.mountainTunnel[0] - 0.006 },
          {
            name: "solar-tunnel-inside",
            u:
              (c.sections.mountainTunnel[0] + c.sections.mountainTunnel[1]) / 2,
          },
        ];
      const crossing = c.sections.crossings[0];
      return [
        { name: "night-lower-level", u: crossing.lowerU - 0.003 },
        { name: "night-upper-level", u: crossing.upperU - 0.003 },
        { name: "night-crossing-overview", u: crossing.lowerU, overview: true },
        {
          name: "night-steep-descent",
          u: c.sections.descent[0] + 0.01,
          view: "first-person",
        },
      ];
    });
    for (const feature of features) {
      await page.evaluate((feature) => {
        const f = window.finishFixture,
          p = f.race.player,
          road = f.track.frame(f.track.length * feature.u);
        p.s = p.contactS = f.track.length * feature.u;
        p.position.copy(road.p).addScaledVector(road.up, 2.2);
        p.yaw = Math.atan2(road.tangent.x, road.tangent.z);
        p.pitch = -Math.asin(road.tangent.y);
        f.world.view = feature.view || "chase";
        f.world.cameraReady = false;
        f.world.cameraForward = null;
        f.world.draw(f.race, 0);
        if (feature.overview) {
          const c = f.track.config.sections.crossings[0],
            lower = f.track.frame(c.lowerU * f.track.length).p,
            upper = f.track.frame(c.upperU * f.track.length).p;
          const target = lower.clone().lerp(upper, 0.5),
            fov = f.world.camera.fov;
          f.world.camera.position
            .copy(target)
            .add(new f.THREE.Vector3(250, 160, -220));
          f.world.camera.up.set(0, 1, 0);
          f.world.camera.lookAt(target);
          f.world.camera.fov = 58;
          f.world.camera.updateProjectionMatrix();
          f.world.lighting.update(f.world.camera);
          f.world.renderer.render(f.world.scene, f.world.camera);
          f.world.camera.fov = fov;
          f.world.camera.updateProjectionMatrix();
        }
      }, feature);
      await page.screenshot({
        path: `test-artifacts/expansion-feature-${feature.name}.png`,
      });
    }
    report.cases.push({
      ...state,
      features,
      featureMethod:
        "isolated real World renderer views, not actual driven positions",
    });
  }
  await context.close();
}
async function hudFourDigits() {
  // Exact frozen production HTML/CSS; UI-only fixture, not simulated driving.
  const html = (await (await fetch(url)).text()).replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/__hud4_fixture__.html", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`${url}/__hud4_fixture__.html`);
  await page.evaluate(async () => {
    document.querySelector("#menu").hidden = true;
    document.querySelector("#hud").hidden = false;
    document.body.classList.add("touch");
    document.querySelector("#hud-track").textContent = "NOCTILUCENT / C3";
    document.querySelector("#speed").textContent = "1234";
    document.querySelector("#speed-bar").style.width = "100%";
    document.querySelector("#thrust-bar").style.width = "75%";
    document.querySelector("#lap").innerHTML = "5<small>/5</small>";
    document.querySelector("#lap-times").innerHTML =
      '<div class="lap-time current"><span>CURRENT</span><b>00:21.34</b></div>' +
      [1, 2, 3, 4]
        .map(
          (i) =>
            `<div class="lap-time"><span>LAP ${i}</span><b>00:35.12</b></div>`,
        )
        .join("");
    await document.fonts.ready;
  });
  const bounds = await page.evaluate(() =>
    Object.fromEntries(
      ["#speed", ".velocity", "#speed-bar", "#thrust-system"].map(
        (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return [
            selector,
            {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            },
          ];
        },
      ),
    ),
  );
  for (const r of Object.values(bounds)) {
    expect(r.width * r.height).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(844);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(390);
  }
  expect(bounds["#speed"].right).toBeLessThanOrEqual(bounds[".velocity"].right);
  await page.screenshot({
    path: "test-artifacts/expansion-hud4-landscape-fixture.png",
  });
  report.cases.push({
    method: "UI-only frozen production HTML/CSS fixture, not actual driving",
    bounds,
  });
  await context.close();
}
async function drive() {
  const course = Number(process.env.INTEGRATED_COURSE || 0);
  const speedClass = Number(process.env.INTEGRATED_CLASS || 0);
  const device = process.env.INTEGRATED_INPUT || "keyboard";
  const targetLaps = Number(process.env.INTEGRATED_LAPS || 5);
  const track = makeTrack(course),
    classSpec = SPEED_CLASSES[speedClass];
  const fullRun = targetLaps === 5;
  const { context, page } = await open(
    device,
    fullRun ? "drive" : "none",
    track.config.layoutId,
    classSpec.id,
  );
  await page.locator("#tracks button").nth(course).click();
  await page.locator('input[name="mode"][value="trial"]').check();
  await chooseClass(page, speedClass, device);
  // Complete the first GPU/asset paint on the menu, before the race clock starts.
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: `test-artifacts/integrated-${track.config.layoutId}-${classSpec.id}-${device}-ready-menu.png`,
  });
  await start(page);
  validateLayout(await telemetry(page), track);
  const held = new Set(),
    samples = [],
    captured = new Set(),
    motionImages = [];
  let motionCursor = 0;
  const tag = `${track.config.layoutId}-${classSpec.id}-${device}`;
  let touchSession,
    touchPad,
    touchButtons,
    touchMask = "",
    touching = false;
  if (device === "touch") {
    touchSession = await context.newCDPSession(page);
    touchPad = await page.locator("#steer-pad").boundingBox();
    touchButtons = {};
    for (const control of ["thrust", "airLeft", "airRight"]) {
      const box = await page
        .locator(`[data-control="${control}"]`)
        .boundingBox();
      touchButtons[control] = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    }
  }
  async function command(steer, coast, air) {
    if (device === "keyboard") {
      const wanted = new Set(coast ? [] : ["KeyW"]);
      if (steer > 0) wanted.add("ArrowLeft");
      if (steer < 0) wanted.add("ArrowRight");
      if (air > 0) wanted.add("KeyJ");
      if (air < 0) wanted.add("KeyL");
      for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
      for (const key of wanted)
        if (!held.has(key)) await page.keyboard.down(key);
      held.clear();
      for (const key of wanted) held.add(key);
    } else if (device === "controller") {
      await page.evaluate(
        ({ steer, coast, air }) => {
          window.qaPad.axes = [-steer, 0, 0, 0];
          window.qaPad.buttons = [
            ...(coast ? [] : [0]),
            ...(air > 0 ? [4] : air < 0 ? [5] : []),
          ];
        },
        { steer, coast, air },
      );
    } else {
      const mask = `${coast}:${air}`;
      if (touching && mask !== touchMask) {
        await touchSession.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        touching = false;
      }
      touchMask = mask;
      await touchSession.send("Input.dispatchTouchEvent", {
        type: touching ? "touchMove" : "touchStart",
        touchPoints: [
          {
            id: 1,
            x: touchPad.x + touchPad.width * (0.5 - steer * 0.4),
            y: touchPad.y + touchPad.height * 0.5,
          },
          ...(coast ? [] : [{ id: 2, ...touchButtons.thrust }]),
          ...(air
            ? [{ id: 3, ...touchButtons[air > 0 ? "airLeft" : "airRight"] }]
            : []),
        ],
      });
      touching = true;
    }
  }
  async function release() {
    for (const key of held) await page.keyboard.up(key);
    if (device === "controller")
      await page.evaluate(() => {
        window.qaPad.axes = [0, 0, 0, 0];
        window.qaPad.buttons = [];
      });
    if (touching)
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
  }
  const began = Date.now();
  let t,
    previousMotion,
    braking = false,
    capturedLap = 0;
  while (Date.now() - began < 420000) {
    const observation = await page.evaluate(
      (cursor) => ({
        t: window.nullVector.telemetry,
        frames: window.qaMotion.slice(cursor),
        cursor: window.qaMotion.length,
      }),
      motionCursor,
    );
    t = observation.t;
    validateLayout(t, track);
    motionCursor = observation.cursor;
    // Validate actual consecutive render/simulation updates, not a sparse Node
    // bracket that can contain an entire ballistic arc and landing impulse.
    const frames = observation.frames;
    const latest = frames.at(-1);
    if (
      !latest ||
      latest.time !== t.time ||
      latest.state !== t.state ||
      latest.worldPosition.some((v, i) => v !== t.worldPosition[i])
    )
      frames.push(t);
    for (const frame of frames) {
      if (previousMotion) {
        try {
          validateMotion(previousMotion, frame, track);
        } catch (error) {
          const trace = await page.evaluate(() => window.qaMotion);
          report.cases.push({
            failure: "motion continuity",
            error: String(error),
            layoutId: track.config.layoutId,
            device,
            speedClass,
            previous: previousMotion,
            current: frame,
            bracketFrames: trace.filter(
              (f) => f.time >= previousMotion.time && f.time <= frame.time,
            ),
            traceFrames: trace.length,
            samples,
          });
          throw error;
        }
      }
      previousMotion = frame;
    }
    if (t.state === "results" || (!fullRun && t.lap > targetLaps)) break;
    if (t.lap > capturedLap) {
      capturedLap = t.lap;
      motionImages.push(
        page.screenshot({
          path: `test-artifacts/integrated-${tag}-lap${t.lap}.png`,
        }),
      );
    }
    const s = (t.lap - 1 + t.progress) * track.length;
    const pace = classSpec.pace,
      baseSpeed = t.speed / pace;
    const plannedBranch = t.lap % 2 ? -1 : 1;
    const [splitStart, splitEnd] = track.config.split;
    const approaching =
      t.progress > splitStart - 0.04 && t.progress < splitStart + 0.035;
    const branch = approaching
      ? plannedBranch
      : t.branch ||
        (t.progress > splitStart - 0.04 && t.progress < splitEnd + 0.02
          ? plannedBranch
          : 0);
    const look = track.frame(s + Math.max(14, baseSpeed * 0.48), branch);
    // Choose an approach lane with actual input while the joined deck is open.
    if (approaching) look.p.addScaledVector(look.right, plannedBranch * 6);
    const delta =
      Math.atan2(look.p.x - t.worldPosition[0], look.p.z - t.worldPosition[2]) -
      t.yaw;
    const error = Math.atan2(Math.sin(delta), Math.cos(delta));
    const demand = error * 2.8 - (t.yawRate / pace) * 0.32;
    const curve = Math.max(
      ...[0.25, 0.6, 0.95].map((ahead) =>
        Math.abs(track.curvature(s + baseSpeed * ahead, branch)),
      ),
    );
    const target =
      Math.min(150, Math.sqrt(80 / Math.max(curve, 0.0001))) * pace;
    if (t.speed > target + 4 * pace || Math.abs(error) > 0.7) braking = true;
    if (t.speed < target && Math.abs(error) < 0.4) braking = false;
    const steer =
      device === "touch"
        ? Math.max(-1, Math.min(1, demand * 4))
        : demand > 0.055
          ? 1
          : demand < -0.055
            ? -1
            : 0;
    await command(
      steer,
      braking,
      Math.abs(error) > 0.38 ? (error > 0 ? 1 : -1) : 0,
    );
    samples.push({
      time: t.time,
      lap: t.lap,
      progress: t.progress,
      branch: t.branch,
      grounded: t.grounded,
      shield: t.shield,
      roll: t.roll,
      yawRate: t.yawRate,
      speed: t.speed,
      worldPosition: t.worldPosition,
      velocity: t.velocity,
      lateralPosition: t.lateralPosition,
      controls: t.controls,
      commanded: { steer, braking },
    });
    if (
      !t.grounded &&
      track.gap(t.progress) &&
      !captured.has(`jump-${t.lap}`)
    ) {
      captured.add(`jump-${t.lap}`);
      motionImages.push(
        page.screenshot({
          path: `test-artifacts/integrated-${tag}-jump-lap${t.lap}.png`,
        }),
      );
    }
    if (samples.length % 100 === 0)
      console.log("INTEGRATED DRIVE", JSON.stringify(samples.at(-1)));
    await page.waitForTimeout(65 / pace);
  }
  await release();
  const images = await Promise.allSettled(motionImages);
  for (const image of images)
    if (image.status === "rejected") throw image.reason;
  expect(t.lapTimes).toHaveLength(targetLaps);
  expect(t.lapTimes.every((v) => v > 0)).toBe(true);
  if (fullRun) {
    expect(t.state).toBe("results");
    expect(
      Math.abs(t.lapTimes.reduce((a, b) => a + b, 0) - t.time),
    ).toBeLessThan(0.1);
  } else expect(t.state).toBe("race");
  const jumps = [];
  for (let lap = 1; lap <= targetLaps; lap++) {
    const flightIndex = samples.findIndex(
      (s) => s.lap === lap && !s.grounded && track.gap(s.progress),
    );
    const flight = samples[flightIndex];
    const landing = samples
      .slice(flightIndex + 1)
      .find(
        (s) =>
          s.lap === lap &&
          s.grounded &&
          s.progress > track.config.jump + track.config.gapLength &&
          s.progress < track.config.sections.runway[1] + 0.015,
      );
    expect(flight, `Actual flight on lap ${lap}`).toBeTruthy();
    expect(landing, `Actual landing on lap ${lap}`).toBeTruthy();
    jumps.push({ lap, flight, landing });
  }
  const crossings = (track.config.sections.crossings || []).map((crossing) => {
    const levels = {};
    for (const [level, u] of [
      ["lower", crossing.lowerU],
      ["upper", crossing.upperU],
    ]) {
      const sample = samples
        .filter((s) => s.lap === 1)
        .reduce((closest, s) =>
          Math.abs(s.progress - u) < Math.abs(closest.progress - u)
            ? s
            : closest,
        );
      const f = track.frame(sample.progress * track.length, sample.branch);
      const expectedY = f.p.y + f.right.y * sample.lateralPosition + 2.2;
      expect(
        Math.abs(sample.progress - u) * track.length,
        `Actually sample the ${level} crossing footprint`,
      ).toBeLessThan(track.frame(u * track.length).width);
      expect(sample.grounded, `${level} crossing contact`).toBe(true);
      expect(
        Math.abs(sample.worldPosition[1] - expectedY),
        `${level} crossing must stay on its own deck`,
      ).toBeLessThan(3);
      levels[level] = {
        sample,
        stationOffset: Math.abs(sample.progress - u) * track.length,
        expectedY,
      };
    }
    return { metadata: crossing, levels };
  });
  // A real-input synthetic driver, never production assistance: prove the
  // authored esses require opposite steering through the browser's own input
  // pipeline, rather than passing merely because the AI earns a lap.
  const cornerSequences = (track.config.rhythm || []).map((bend) => {
    const sequence = samples.filter(
      (s) => s.lap === 1 && s.progress >= bend.start && s.progress <= bend.end,
    );
    expect(
      sequence.length,
      "actually traverse the new corner sequence",
    ).toBeGreaterThan(8);
    expect(
      sequence.some((s) => s.controls.steer > 0.05),
      "positive real steering in the esses",
    ).toBe(true);
    expect(
      sequence.some((s) => s.controls.steer < -0.05),
      "negative real steering in the esses",
    ).toBe(true);
    return {
      bend,
      input: device,
      samples: sequence,
      braking: sequence.filter((s) => s.commanded.braking).length,
      shieldBefore: sequence[0].shield,
      shieldAfter: sequence.at(-1).shield,
    };
  });
  const descent = track.config.sections.descent;
  const drop = descent
    ? samples.filter(
        (s) =>
          s.lap === 1 && s.progress >= descent[0] && s.progress <= descent[1],
      )
    : [];
  if (descent) {
    expect(drop.length).toBeGreaterThan(1);
    expect(
      drop[0].worldPosition[1] - drop.at(-1).worldPosition[1],
    ).toBeGreaterThan(0);
  }
  let records;
  if (fullRun) {
    for (let lap = 1; lap <= 5; lap++)
      await expect(page.locator("#result-data")).toContainText(`LAP / ${lap}`);
    await expect(page.locator("#result-data")).toContainText(
      `${classSpec.name} / 5 LAPS`,
    );
    await page.screenshot({
      path: `test-artifacts/integrated-${tag}-five-lap-results.png`,
    });
    for (const [label, viewport] of [
      ["landscape", { width: 844, height: 390 }],
      ["portrait", { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(viewport);
      const panel = await page.locator("#results .panel").boundingBox();
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({
        path: `test-artifacts/integrated-${tag}-results-${label}-resize.png`,
      });
      await page.locator("#result-quit").scrollIntoViewIfNeeded();
      const quit = await page.locator("#result-quit").boundingBox();
      expect(quit.y).toBeGreaterThanOrEqual(0);
      expect(quit.y + quit.height).toBeLessThanOrEqual(viewport.height);
    }
    records = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nv-records")),
    );
    const activeKey = recordKey(track.config.layoutId, classSpec.id);
    expect(records[activeKey]).toBeCloseTo(t.time, 4);
    for (const [key, value] of Object.entries(preservedRecords))
      if (key !== activeKey)
        expect(records[key], `Preserve unrelated record ${key}`).toBe(value);
    await page.locator("#result-quit").click();
    await page.locator("#tracks button").first().click();
    await chooseClass(page, 1, device);
    const otherRecord = records[recordKey(TRACKS[0].layoutId, "c2")];
    await expect(page.locator("#best")).toHaveText(
      `LOCAL RECORD / ${otherRecord ? `${String(Math.floor(otherRecord / 60)).padStart(2, "0")}:${(otherRecord % 60).toFixed(2).padStart(5, "0")}` : "—"}`,
    );
  } else
    await page.screenshot({
      path: `test-artifacts/integrated-${tag}-one-lap.png`,
    });
  report.cases.push({
    course,
    device,
    speedClass,
    targetLaps,
    layoutId: track.config.layoutId,
    stationLength: track.length,
    physicalLength: track.physicalLength,
    physicalLengths: track.physicalLengths,
    result: t,
    records,
    samples,
    motionTrace: await page.evaluate(() => window.qaMotion),
    jumps,
    crossings,
    cornerSequences,
    drop,
    method: `Synthetic test driver using actual ${device} input; ${targetLaps} natural laps, read-only telemetry; no Race state injection or production steering assistance`,
  });
  await context.close();
}
try {
  if (scope === "public")
    for (const device of ["keyboard", "touch"]) await publicSmoke(device);
  else if (scope === "ui") await ui();
  else if (scope === "pace") await pace();
  else if (scope === "menu") await menuSplit();
  else if (scope === "drive") await drive();
  else if (scope === "finish") await finishFixture();
  else if (scope === "hud4") await hudFourDigits();
  else throw new Error(`Unknown integrated scope: ${scope}`);
  expect(report.errors).toEqual([]);
  console.log(`Integrated ${scope}: ${report.cases.length} cases passed.`);
} finally {
  await writeFile(
    `test-artifacts/${process.env.INTEGRATED_REPORT || `integrated-${scope}-report.json`}`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
