import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Explicit coordinator GPU grant is required; preparing/checking this file must
// never start Chromium. Serve this exact branch with Vite after the grant.
if (process.env.PULSE_GPU_GRANTED !== "1")
  throw new Error(
    "PULSE_GPU_GRANTED=1 requires an explicit coordinator GPU grant",
  );
if (!process.env.SOURCE_URL)
  throw new Error("SOURCE_URL must name this branch's Vite server");
const url = process.env.SOURCE_URL;
const output =
  process.env.PULSE_ARTIFACTS || "/var/tmp/belmondo-pulse-acceptance";
await mkdir(output, { recursive: true });
const report = {
  method:
    "FIXTURE: positioned real Race bodies; actual fire/update/World.draw, no injected hit/effect state",
  url,
  cases: [],
  errors: [],
};
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1000, height: 625 }],
    ["mobile", { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/__pulse_fixture__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}label{position:fixed;top:6px;left:6px;color:white;font:12px monospace;background:#000c;padding:4px}</style><canvas></canvas><label>FIXTURE — real Race PULSE / physics / World</label>",
      }),
    );
    await page.goto(`${url}/__pulse_fixture__.html`);
    await page.evaluate(async () => {
      const source = await (await fetch("/src/world.js")).text();
      const module = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import(module),
        ]);
      const assetsReady = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (asset) =>
          reject(new Error(asset));
      });
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      const input = {
        throttle: true,
        steer: 0,
        air: 0,
        pitch: 0,
        brake: false,
      };
      let track;
      let race;
      function create(direction, condition = "hit") {
        const result = new Race(track);
        result.racers = result.racers.slice(0, 2);
        result.countdown = 0;
        result.pickups = [];
        for (const r of result.racers) {
          const s =
            track.length * 0.005 +
            (r.id ? (direction === "player-ai" ? 24 : -24) : 0);
          const f = track.frame(s);
          r.s = r.contactS = s;
          r.position.copy(f.p);
          r.position.y += 2.2;
          r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
          r.velocity.copy(f.tangent).multiplyScalar(160);
          r.speed = Math.hypot(r.velocity.x, r.velocity.z);
          r.gate = Math.floor((s / track.length) * 32) + 1;
          r.checkpoint = { s, branch: 0, gate: r.gate };
          r.aiFire = Infinity;
        }
        const shooter =
          direction === "player-ai" ? result.player : result.racers[1];
        const target =
          direction === "player-ai" ? result.racers[1] : result.player;
        if (condition === "protected") target.protect = 2;
        if (condition === "miss") {
          const f = track.frame(target.contactS);
          target.position.addScaledVector(f.right, 15);
        }
        shooter.weapon = "PULSE";
        return { result, shooter, target };
      }
      const values = (r) => ({
        shield: r.shield,
        speed: r.speed,
        velocity: r.velocity.toArray(),
        pulseHit: r.pulseHit,
        stun: r.stun,
        protect: r.protect,
      });
      function inspect(target) {
        const root = world.weaponEffects.pools.get("PULSE_HIT")[target.id].root;
        const ndc = target.position.clone().project(world.camera);
        return {
          target: values(target),
          arcs: root.visible,
          following: root.position.distanceTo(target.position),
          opacity: root.children.map((arc) => arc.material.opacity),
          ndc: ndc.toArray(),
          pool: world.weaponEffects.pools.get("PULSE_HIT").length,
          drawCalls: world.renderer.info.render.calls,
          triangles: world.renderer.info.render.triangles,
        };
      }
      window.pulseFixture = {
        course(index) {
          track = makeTrack(index);
          world.build(track);
        },
        hit(direction, view, condition = "hit") {
          world.weaponEffects.reset();
          const { result, shooter, target } = create(direction, condition);
          race = result;
          world.setupRacers(race, CRAFT);
          world.setView(view);
          world.cameraReady = false;
          world.cameraForward = null;
          const before = values(target);
          race.fire(shooter);
          const immediate = values(target);
          const immediateEvents = race.events.map((event) => ({ ...event }));
          world.draw(race, 0);
          const first = inspect(target);
          const control = create(direction, condition);
          // Generic actual damage gives the comparison body the identical
          // initial damage/momentum/stun, without PULSE's engine attenuation.
          if (condition === "hit") control.result.damage(control.target, 18);
          for (let i = 0; i < 12; i++) {
            race.update(1 / 120, input);
            control.result.update(1 / 120, input);
          }
          world.draw(race, 0.1);
          window.pulseFixture.target = target;
          return {
            before,
            immediate,
            immediateEvents,
            first,
            after: inspect(target),
            comparison: values(control.target),
            condition,
            direction,
          };
        },
        expireAndRefire(direction) {
          const oldTarget = window.pulseFixture.target;
          const oldSlot =
            world.weaponEffects.pools.get("PULSE_HIT")[oldTarget.id];
          for (let i = 0; i < 84; i++) {
            race.update(1 / 120, input);
          }
          world.draw(race, 0.7);
          const expired = inspect(oldTarget);
          // Reposition a fresh scenario, not a fake pulse timer/effect. Slots
          // survive reset and the new hit still calls actual Race.fire.
          const second = window.pulseFixture.hit(direction, world.view);
          return {
            expired,
            second,
            reused:
              oldSlot ===
              world.weaponEffects.pools.get("PULSE_HIT")[oldTarget.id],
          };
        },
      };
      await assetsReady;
    });
    for (const course of [0, 2]) {
      await page.evaluate((index) => window.pulseFixture.course(index), course);
      for (const view of ["chase", "first-person"]) {
        for (const direction of ["player-ai", "ai-player"]) {
          const sample = await page.evaluate(
            ({ direction, view }) => window.pulseFixture.hit(direction, view),
            { direction, view },
          );
          assert.ok(sample.immediate.shield < sample.before.shield);
          assert.ok(
            Math.abs(sample.immediate.speed - sample.before.speed * 0.78) <
              1e-8,
          );
          assert.ok(sample.first.arcs && sample.after.arcs);
          assert.ok(sample.after.following < 1e-8);
          assert.ok(sample.after.target.speed < sample.comparison.speed);
          assert.ok(sample.after.target.pulseHit < sample.immediate.pulseHit);
          const name = `pulse-${device}-course${course}-${view}-${direction}`;
          await page.screenshot({ path: `${output}/${name}.png` });
          const lifecycle = await page.evaluate(
            (direction) => window.pulseFixture.expireAndRefire(direction),
            direction,
          );
          assert.equal(lifecycle.expired.target.pulseHit, 0);
          assert.equal(lifecycle.expired.arcs, false);
          assert.equal(lifecycle.reused, true);
          assert.equal(lifecycle.second.first.arcs, true);
          report.cases.push({ name, sample, lifecycle });
        }
      }
      for (const condition of ["protected", "miss"]) {
        for (const direction of ["player-ai", "ai-player"]) {
          const sample = await page.evaluate(
            ({ direction, condition }) =>
              window.pulseFixture.hit(direction, "chase", condition),
            { direction, condition },
          );
          assert.equal(sample.immediate.shield, sample.before.shield);
          assert.deepEqual(sample.immediate.velocity, sample.before.velocity);
          assert.equal(sample.immediate.pulseHit, 0);
          assert.ok(
            !sample.immediateEvents.some((event) => event.kind === "hit"),
          );
          assert.equal(sample.first.arcs, false);
          assert.equal(sample.after.arcs, false);
          report.cases.push({ device, course, direction, condition, sample });
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
