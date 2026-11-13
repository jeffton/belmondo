import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack } from "../src/track.js";

const gameUrl = process.env.GAME_URL || "http://127.0.0.1:5189";
const sourceUrl = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const stage = process.env.FLAGSHIP_STAGE || "all";
const track = makeTrack(0),
  wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
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
  report = {
    gameUrl,
    sourceUrl,
    method:
      "Actual keyboard/touch driving on static snapshot; separate owned World fixtures for visual/raycast inspection",
    errors,
  };
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}
function profile(frames) {
  return {
    frames: frames.length,
    medianMs: percentile(
      frames.map((f) => f.dt),
      0.5,
    ),
    p95Ms: percentile(
      frames.map((f) => f.dt),
      0.95,
    ),
    maxMs: Math.max(...frames.map((f) => f.dt)),
    drawCallsMedian: percentile(
      frames.map((f) => f.drawCalls),
      0.5,
    ),
    drawCallsMax: Math.max(...frames.map((f) => f.drawCalls)),
    trianglesMedian: percentile(
      frames.map((f) => f.triangles),
      0.5,
    ),
    trianglesMax: Math.max(...frames.map((f) => f.triangles)),
  };
}
async function drive(mobile, startupSeconds = null) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(() => {
    window.flagshipFrameSamples = [];
    let previous;
    const sample = (now) => {
      const t = window.nullVector?.telemetry;
      if (t?.state === "race" && !t.paused && t.time > 0.1) {
        if (previous !== undefined)
          window.flagshipFrameSamples.push({
            dt: now - previous,
            drawCalls: t.drawCalls,
            triangles: t.triangles,
            progress: t.progress,
          });
        previous = now;
      } else previous = undefined;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(gameUrl);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#quality").check();
  await page.locator("#start").click();
  if (!mobile) await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  const cdp = mobile ? await context.newCDPSession(page) : null;
  const pad = mobile ? await page.locator("#steer-pad").boundingBox() : null;
  const coast = mobile
    ? await page.locator('[data-control="coast"]').boundingBox()
    : null;
  const samples = [],
    transitions = [];
  const held = new Set(mobile ? [] : ["ArrowUp"]);
  const began = Date.now();
  let previous = null,
    touching = false,
    braking = false;
  while (Date.now() - began < (mobile ? 100000 : 300000)) {
    const t = await page.evaluate(() => window.nullVector.telemetry);
    const s = (t.lap - 1 + t.progress) * track.length;
    const branch =
      t.branch ||
      (t.progress > track.config.split[0] - 0.04 &&
      t.progress < track.config.split[1] + 0.02
        ? -1
        : 0);
    const look = track.frame(s + Math.max(14, t.speed * 0.48), branch);
    const error = wrap(
      Math.atan2(look.p.x - t.worldPosition[0], look.p.z - t.worldPosition[2]) -
        t.yaw,
    );
    const demand = error * 2.8 - t.yawRate * 0.32;
    const curvature = Math.max(
      ...[0.25, 0.6, 0.95].map((ahead) =>
        Math.abs(track.curvature(s + t.speed * ahead, branch)),
      ),
    );
    const targetSpeed = Math.min(
      mobile ? 140 : 150,
      Math.sqrt(80 / Math.max(curvature, 0.0001)),
    );
    const needBrake = t.speed > targetSpeed + 4 || Math.abs(error) > 0.7;
    if (mobile) {
      if (touching && braking !== needBrake) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        touching = false;
      }
      const steer = -Math.max(-1, Math.min(1, demand));
      const points = [
        {
          id: 1,
          x: pad.x + pad.width * (0.5 + steer * 0.4),
          y: pad.y + pad.height / 2,
        },
      ];
      if (needBrake)
        points.push({
          id: 2,
          x: coast.x + coast.width / 2,
          y: coast.y + coast.height / 2,
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: touching ? "touchMove" : "touchStart",
        touchPoints: points,
      });
      touching = true;
      braking = needBrake;
    } else {
      const wanted = new Set(needBrake ? [] : ["ArrowUp"]);
      if (demand > 0.055) wanted.add("ArrowLeft");
      else if (demand < -0.055) wanted.add("ArrowRight");
      if (Math.abs(error) > 0.38) wanted.add(error > 0 ? "KeyJ" : "KeyL");
      for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
      for (const key of wanted)
        if (!held.has(key)) await page.keyboard.down(key);
      held.clear();
      for (const key of wanted) held.add(key);
    }
    samples.push(t);
    if (previous && previous.grounded !== t.grounded)
      transitions.push({
        time: t.time,
        progress: t.progress,
        grounded: t.grounded,
        height: t.height,
        shield: t.shield,
        speed: t.speed,
      });
    previous = t;
    if (
      startupSeconds !== null
        ? t.time >= startupSeconds
        : mobile
          ? t.time > 12
          : t.lap > 1 || t.time > 140
    )
      break;
    if (samples.length % 100 === 0)
      console.log(
        mobile ? "TOUCH" : "LAP",
        t.time.toFixed(2),
        t.progress.toFixed(3),
        t.shield.toFixed(1),
      );
    await new Promise((resolve) => setTimeout(resolve, 65));
  }
  if (mobile)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  else for (const key of held) await page.keyboard.up(key);
  const frames = await page.evaluate(() => window.flagshipFrameSamples);
  const last = samples.at(-1);
  const result = {
    mobile,
    viewport: page.viewportSize(),
    quality: "retro",
    softwareRenderer: "SwiftShader",
    completedLap: last.lap > 1,
    time: last.time,
    progress: last.progress,
    minShield: Math.min(...samples.map((t) => t.shield)),
    maxSpeed: Math.max(...samples.map((t) => t.speed)),
    maxHeight: Math.max(...samples.map((t) => t.height)),
    maxSampleGap: Math.max(
      ...samples.slice(1).map((t, i) => t.time - samples[i].time),
    ),
    transitions,
    profile: profile(frames),
    assets: await page
      .locator('script[type="module"]')
      .evaluateAll((els) => els.map((el) => el.src)),
  };
  await writeFile(
    `test-artifacts/flagship-${mobile ? "touch" : "lap"}-samples.json`,
    JSON.stringify({ samples, frames }),
  );
  // Only after the measured input section ends, capture the real app. No mid-lap stalls.
  await page.screenshot({
    path: `test-artifacts/flagship-actual-${mobile ? "mobile" : "desktop"}.png`,
  });
  await context.close();
  console.log("DRIVE RESULT", JSON.stringify(result));
  return result;
}
async function visuals(deltaOnly = false) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__flagship_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${sourceUrl}/__flagship_fixture__.html`);
  const result = await page.evaluate(async (deltaOnly) => {
    const source = await (await fetch("/src/world.js")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
      await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import(threePath),
      ]);
    const ready = () =>
      new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
    const initialAssets = ready();
    const world = new World(document.querySelector("canvas"));
    let track = makeTrack(0),
      race = new Race(track, 0, "trial");
    world.build(track);
    world.setupRacers(race, CRAFT);
    await initialAssets;
    const shots = [],
      captures = [];
    function at(u, branch = 0) {
      const r = race.player,
        f = track.frame(u * track.length, branch);
      r.s = r.contactS = u * track.length;
      r.branch = branch;
      r.position.copy(f.p);
      r.position.y += 2.2;
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      r.pitch = -Math.atan2(f.tangent.y, Math.hypot(f.tangent.x, f.tangent.z));
      r.yawRate = 0;
      r.velocity.copy(f.tangent).multiplyScalar(110);
      r.speed = 110;
      world.setView("chase");
      world.camera.fov = 77;
      world.draw(race, 1 / 60);
      world.draw(race, 1 / 60);
    }
    for (const [framing, width, height] of [
      ["desktop", 1280, 800],
      ["mobile-framed", 844, 390],
    ]) {
      world.renderer.setSize(width, height, false);
      world.camera.aspect = width / height;
      world.camera.updateProjectionMatrix();
      for (const [landmark, u, branch] of [
        ["frontage", 0.045, 0],
        ["covered", 0.145, 0],
        ["harbor", 0.221, 0],
        ["split-inner", 0.35, -1],
        ["split-outer", 0.35, 1],
        ["return", 0.61, 0],
        ["landing", track.config.jump + 0.06, 0],
      ]) {
        if (deltaOnly && !["frontage", "covered"].includes(landmark)) continue;
        at(u, branch);
        const name = `${framing}-${landmark}`;
        captures.push({
          name,
          data: world.renderer.domElement.toDataURL("image/png").split(",")[1],
        });
        shots.push({
          name,
          progress: u,
          branch,
          drawCalls: world.renderer.info.render.calls,
          triangles: world.renderer.info.render.triangles,
        });
      }
    }
    const root = world.scene.getObjectByName("kaiseki-waterfront");
    world.scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(),
      intrusion = [];
    let rays = 0;
    for (let i = 0; i < 400; i++) {
      const u = i / 400;
      const branches =
        u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
      for (const branch of branches) {
        const f = track.frame(u * track.length, branch);
        for (const x of [-f.width + 0.3, 0, f.width - 0.3]) {
          raycaster.set(
            f.p
              .clone()
              .addScaledVector(f.right, x)
              .add(new THREE.Vector3(0, 0.2, 0)),
            new THREE.Vector3(0, 1, 0),
          );
          raycaster.near = 0;
          raycaster.far = 3.8;
          const hit = raycaster.intersectObject(root, true)[0];
          rays++;
          if (hit)
            intrusion.push({
              progress: u,
              branch,
              x,
              height: hit.distance + 0.2,
            });
        }
      }
    }
    const setupLifecycle = [];
    for (let i = 0; i < 5; i++) {
      const previousShips = [...world.ships];
      world.sparkData[0].life = 1;
      race = new Race(track, i % CRAFT.length, "race");
      world.setupRacers(race, CRAFT);
      at(0.045);
      const geometries = new Set();
      world.scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
      });
      setupLifecycle.push({
        children: world.scene.children.length,
        distinctGeometries: geometries.size,
        rendererGeometries: world.renderer.info.memory.geometries,
        ships: world.ships.length,
        oldDetached: previousShips.every(
          (ship) =>
            ship.parent === null && ship.userData.shadow.parent === null,
        ),
        sparksReset: world.sparkData.every((particle) => particle.life === 0),
      });
    }
    const persistentMaps = Object.values(world.flagshipAssets),
      rebuilt = [];
    for (const index of [1, 0]) {
      const loaded = ready();
      track = makeTrack(index);
      world.build(track);
      race = new Race(track, 0, "trial");
      world.setupRacers(race, CRAFT);
      await loaded;
      at(0.045);
      rebuilt.push({
        track: index,
        flagshipPresent: !!world.scene.getObjectByName("kaiseki-waterfront"),
        persistentAssetMaps: Object.values(world.flagshipAssets).every(
          (map, i) => map === persistentMaps[i],
        ),
        imageWidths: Object.values(world.flagshipAssets).map(
          (map) => map.image.width,
        ),
      });
    }
    world.renderer.dispose();
    return { shots, captures, rays, intrusion, rebuilt, setupLifecycle };
  }, deltaOnly);
  for (const image of result.captures)
    await writeFile(
      `test-artifacts/flagship-${image.name}.png`,
      Buffer.from(image.data, "base64"),
    );
  delete result.captures;
  await context.close();
  return result;
}
async function restartChecks() {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(gameUrl);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#quality").check();
  await page.locator('input[name="mode"][value="race"]').check();
  await page.locator("#start").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  await expect(page.locator("#position")).toContainText("/8");
  await page.keyboard.press("Escape");
  await page.locator("#restart").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  await expect(page.locator("#position")).toContainText("/8");
  await page.keyboard.press("Escape");
  await page.locator("#quit").click();
  await page.locator("#crafts button").nth(1).click();
  await expect(page.locator("#crafts button").nth(1)).toHaveClass(/active/);
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#start").click();
  await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  await expect(page.locator("#position")).toContainText("/1");
  const result = {
    raceRestart: true,
    changedCraft: await page.locator("#crafts button.active b").textContent(),
    changedMode: await page.locator('input[name="mode"]:checked').inputValue(),
    trialPosition: await page.locator("#position").textContent(),
  };
  await context.close();
  return result;
}
try {
  if (stage === "delta") {
    report.visuals = await visuals(true);
    expect(report.visuals.intrusion).toEqual([]);
    const lifecycle = report.visuals.setupLifecycle;
    expect(new Set(lifecycle.map((r) => r.children)).size).toBe(1);
    expect(new Set(lifecycle.map((r) => r.distinctGeometries)).size).toBe(1);
    expect(new Set(lifecycle.map((r) => r.rendererGeometries)).size).toBe(1);
    for (const row of lifecycle) {
      expect(row.ships).toBe(8);
      expect(row.oldDetached).toBe(true);
      expect(row.sparksReset).toBe(true);
    }
    report.desktop = await drive(false, 12);
    expect(report.desktop.time).toBeGreaterThanOrEqual(12);
    report.mobile = await drive(true, 12);
    expect(report.mobile.time).toBeGreaterThanOrEqual(12);
    report.restart = await restartChecks();
  }
  if (stage === "all" || stage === "drive") {
    report.desktop = await drive(false);
    expect(
      report.desktop.completedLap,
      "Real keyboard input must complete a lap",
    ).toBe(true);
    expect(
      report.desktop.transitions.some(
        (t) => !t.grounded && t.progress >= track.config.jump,
      ),
    ).toBe(true);
    expect(
      report.desktop.transitions.some(
        (t) => t.grounded && t.progress > track.config.jump,
      ),
    ).toBe(true);
    report.mobile = await drive(true);
    expect(report.mobile.time).toBeGreaterThanOrEqual(12);
    expect(report.mobile.maxSpeed).toBeGreaterThan(0);
  }
  if (stage === "all" || stage === "visual") {
    report.visuals = await visuals();
    expect(
      report.visuals.intrusion,
      "Sampled architecture must clear the road hull envelope",
    ).toEqual([]);
    expect(report.visuals.rebuilt.map((r) => r.flagshipPresent)).toEqual([
      false,
      true,
    ]);
    for (const rebuilt of report.visuals.rebuilt) {
      expect(rebuilt.persistentAssetMaps).toBe(true);
      expect(rebuilt.imageWidths.every((width) => width > 0)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
} finally {
  await writeFile(
    "test-artifacts/flagship-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
