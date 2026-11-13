import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTrack } from "../src/track.js";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const sourceUrl = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const gameUrl = process.env.GAME_URL || "http://127.0.0.1:5188";
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
    method:
      "Standalone rendered World/Race fixture, plus a short real-keyboard static-snapshot drive; no application mutation hooks",
  };
try {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 690 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__contacts_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${sourceUrl}/__contacts_fixture__.html`);
  report.fixture = await page.evaluate(async () => {
    const moduleText = await (await fetch("/src/world.js")).text();
    const threePath = moduleText.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, { hullExtent }, THREE] =
      await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import("/src/contacts.js"),
        import(threePath),
      ]);
    const world = new World(document.querySelector("canvas"));
    const track = makeTrack(0),
      cases = [],
      images = [];
    let race, submissions;
    async function setup(count) {
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
      world.build(track);
      race = new Race(track, 0, "race");
      race.countdown = 0;
      race.racers = race.racers.slice(0, count);
      world.setupRacers(race, CRAFT);
      await loaded;
      submissions = Array(count).fill(0);
      for (const ship of world.ships)
        ship.traverse((mesh) => {
          if (mesh.isMesh)
            mesh.onBeforeRender = () => {
              submissions[world.ships.indexOf(ship)]++;
            };
        });
    }
    function place(r, s, x, speed = 120, yawOffset = 0, lateralSpeed = 0) {
      const f = track.frame(s);
      r.s = r.contactS = s;
      r.gate = Math.floor((s / track.length) * 32) + 1;
      r.checkpoint = { s, branch: 0, gate: r.gate };
      r.x = x;
      r.position.copy(f.p).addScaledVector(f.right, x);
      r.position.y += 2.2;
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z) + yawOffset;
      r.velocity
        .set(Math.sin(r.yaw) * speed, 0, Math.cos(r.yaw) * speed)
        .addScaledVector(f.right, lateralSpeed);
      r.speed = Math.hypot(r.velocity.x, r.velocity.z);
    }
    function state(r) {
      return {
        id: r.id,
        position: r.position.toArray(),
        velocity: r.velocity.toArray(),
        speed: r.speed,
        shield: r.shield,
        grounded: r.grounded,
        x: r.x,
      };
    }
    function render() {
      submissions.fill(0);
      world.draw(race, 1 / 30);
      return {
        visible: world.ships.map((s) => s.visible),
        submissions: [...submissions],
        alignmentError: Math.max(
          ...race.racers.map((r) =>
            world.ships[r.id].position.distanceTo(r.position),
          ),
        ),
      };
    }
    function capture(name) {
      images.push({
        name,
        data: world.renderer.domElement.toDataURL("image/png").split(",")[1],
      });
    }
    const neutral = { throttle: true, steer: 0, air: 0, brake: false };
    try {
      await setup(2);
      const s = track.length * 0.02;
      const outerStart = track.frame(s).width - 8;
      place(race.player, s, outerStart - 7, 120, 0.2);
      place(race.racers[1], s, outerStart);
      const before = race.racers.map(state);
      let wallFrames = 0,
        renderedPressureFrames = 0,
        maxWallExcess = -Infinity,
        maxStepDistance = 0,
        maxRenderError = 0,
        airborne = 0;
      for (let step = 0; step < 90; step++) {
        const previous = race.racers.map((r) => r.position.clone());
        race.update(1 / 120, neutral);
        for (const r of race.racers) {
          const f = track.frame(r.contactS, r.branch);
          maxWallExcess = Math.max(
            maxWallExcess,
            Math.abs(r.x) + hullExtent(r, f.right) - f.width,
          );
          maxStepDistance = Math.max(
            maxStepDistance,
            r.position.distanceTo(previous[r.id]),
          );
          if (!r.grounded) airborne++;
        }
        if (race.racers[1].wallTouched) wallFrames++;
        if (step % 3 === 0) {
          const frame = render();
          maxRenderError = Math.max(maxRenderError, frame.alignmentError);
          if (
            race.racers[1].wallTouched &&
            frame.visible[1] &&
            frame.submissions[1] > 0
          )
            renderedPressureFrames++;
        }
      }
      render();
      capture("sustained-wall-pressure");
      cases.push({
        name: "sustained-wall-pressure",
        steps: 90,
        wallFrames,
        renderedPressureFrames,
        maxWallExcess,
        maxStepDistance,
        maxRenderError,
        airborne,
        before,
        after: race.racers.map(state),
        finalRender: render(),
      });

      for (const aiOnly of [false, true]) {
        await setup(aiOnly ? 3 : 2);
        const s = track.length * 0.05;
        if (aiOnly) place(race.player, s - 20, -4, 100);
        const a = race.racers[aiOnly ? 1 : 0],
          b = race.racers[aiOnly ? 2 : 1];
        place(a, s, 0, 100, 0, 20);
        place(b, s, 6.1, 100);
        const right = track.frame(s).right;
        const before = [a, b].map(state),
          lateralBefore = [a, b].map((r) => r.velocity.dot(right));
        race.update(1 / 120, neutral);
        const finalRender = render();
        capture(aiOnly ? "ai-ai-contact" : "player-ai-contact");
        cases.push({
          name: aiOnly ? "ai-ai-contact" : "player-ai-contact",
          before,
          after: [a, b].map(state),
          lateralBefore,
          lateralAfter: [a, b].map((r) => r.velocity.dot(right)),
          finalRender,
        });
      }

      await setup(2);
      place(race.player, track.length * 0.05, -3, 150);
      place(race.racers[1], track.length * 0.05 + 12, 7, 100);
      const initialRank = race.position;
      let maxPassStepDistance = 0,
        minShield = 100;
      for (let step = 0; step < 96; step++) {
        const p = race.player,
          target = track.frame(p.contactS + Math.max(14, p.speed * 0.5));
        const error = Math.atan2(
          Math.sin(
            Math.atan2(target.p.x - p.position.x, target.p.z - p.position.z) -
              p.yaw,
          ),
          Math.cos(
            Math.atan2(target.p.x - p.position.x, target.p.z - p.position.z) -
              p.yaw,
          ),
        );
        const previous = race.racers.map((r) => r.position.clone());
        race.update(1 / 120, {
          ...neutral,
          steer: Math.max(-1, Math.min(1, error * 2.5 - p.yawRate * 0.25)),
        });
        for (const r of race.racers) {
          maxPassStepDistance = Math.max(
            maxPassStepDistance,
            r.position.distanceTo(previous[r.id]),
          );
          minShield = Math.min(minShield, r.shield);
        }
        if (step % 4 === 0) render();
      }
      const finalRender = render();
      capture("ordinary-pass");
      cases.push({
        name: "ordinary-pass",
        initialRank,
        finalRank: race.position,
        maxPassStepDistance,
        minShield,
        finalRender,
        after: race.racers.map(state),
      });
      return { cases, images, noApplicationHooks: !window.nullVector };
    } finally {
      world.renderer.dispose();
    }
  });
  for (const image of report.fixture.images)
    await writeFile(
      `test-artifacts/contacts-${image.name}.png`,
      Buffer.from(image.data, "base64"),
    );
  delete report.fixture.images;
  const pressure = report.fixture.cases[0];
  expect(pressure.wallFrames).toBeGreaterThan(20);
  expect(pressure.renderedPressureFrames).toBeGreaterThan(5);
  expect(pressure.maxWallExcess).toBeLessThan(0.05);
  expect(pressure.maxStepDistance).toBeLessThan(2);
  expect(pressure.airborne).toBe(0);
  expect(pressure.maxRenderError).toBe(0);
  expect(pressure.after[1].shield).toBeLessThan(99);
  expect(pressure.after[1].x).toBeGreaterThan(pressure.before[1].x + 3);
  for (const item of report.fixture.cases.slice(1, 3)) {
    expect(item.lateralAfter[0]).toBeLessThan(15);
    expect(item.lateralAfter[1]).toBeGreaterThan(5);
    expect(item.finalRender.visible.every(Boolean)).toBe(true);
    expect(item.finalRender.alignmentError).toBe(0);
    expect(item.finalRender.submissions.at(-1)).toBeGreaterThan(0);
  }
  const pass = report.fixture.cases[3];
  expect(pass.initialRank).toBe(2);
  expect(pass.finalRank).toBe(1);
  expect(pass.minShield).toBe(100);
  expect(pass.maxPassStepDistance).toBeLessThan(2);
  expect(pass.finalRender.visible[1]).toBe(true);
  await context.close();

  // A brief real keyboard drive in the exact release snapshot, never assigning telemetry/racers.
  const live = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const actual = await live.newPage();
  actual.on("pageerror", (e) => errors.push(e.message));
  await actual.goto(gameUrl);
  await actual.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await actual.locator("#quality").check();
  await goToSetupStage(actual, "track");
  await actual.locator("#tracks button").first().click();
  await goToSetupStage(actual, "craft");
  await actual.locator("#start").click();
  await actual.keyboard.down("ArrowUp");
  await actual.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
  const planningTrack = makeTrack(0),
    began = Date.now();
  let held = null,
    t;
  while (Date.now() - began < 20000) {
    t = await actual.evaluate(() => window.nullVector.telemetry);
    const f = planningTrack.frame(
      t.progress * planningTrack.length + Math.max(14, t.speed * 0.5),
    );
    const error = Math.atan2(
      Math.sin(
        Math.atan2(f.p.x - t.worldPosition[0], f.p.z - t.worldPosition[2]) -
          t.yaw,
      ),
      Math.cos(
        Math.atan2(f.p.x - t.worldPosition[0], f.p.z - t.worldPosition[2]) -
          t.yaw,
      ),
    );
    const demand = error * 2.8 - t.yawRate * 0.32;
    const key =
      demand > 0.055 ? "ArrowLeft" : demand < -0.055 ? "ArrowRight" : null;
    if (key !== held) {
      if (held) await actual.keyboard.up(held);
      if (key) await actual.keyboard.down(key);
      held = key;
    }
    if (t.progress > 0.06) break;
    await new Promise((resolve) => setTimeout(resolve, 65));
  }
  expect(t.progress).toBeGreaterThan(0.06);
  await actual.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some((r) => r.name.includes("16-25-29") && r.responseStatus === 200),
  );
  await actual.screenshot({
    path: "test-artifacts/final-snapshot-advertising-road.png",
  });
  report.snapshot = {
    url: gameUrl,
    time: t.time,
    progress: t.progress,
    shield: t.shield,
    speed: t.speed,
    assets: await actual
      .locator('script[type="module"],link[rel="stylesheet"]')
      .evaluateAll((els) => els.map((e) => e.src || e.href)),
  };
  await live.close();
  expect(errors).toEqual([]);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    "test-artifacts/contacts-browser-report.json",
    JSON.stringify({ ...report, errors }, null, 2),
  );
  await browser.close();
}
