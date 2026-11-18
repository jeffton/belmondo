import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const out = process.env.ARTIFACT_DIR || "test-artifacts/palm-breaker";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const rows = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 625 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__palm-breaker__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__palm-breaker__.html`);
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const threeURL = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [THREE, { World }, { Race, CRAFT }, { makeTrack, TRACK_INDEX }] =
      await Promise.all([
        import(threeURL),
        import("/src/world.ts"),
        import("/src/race.ts"),
        import("/src/track.ts"),
      ]);
    const loaded = new Promise((resolve, reject) => {
      THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      THREE.DefaultLoadingManager.onLoad = resolve;
    });
    const world = new World(document.querySelector("canvas"));
    const track = makeTrack(TRACK_INDEX.COAST);
    world.build(track);
    const race = new Race(track, 0, "trial", 0, world.environment.terrain);
    race.countdown = 0;
    world.setupRacers(race, CRAFT);
    await loaded;
    function position(racer, station, branch, speed) {
      const frame = track.frame(station, branch);
      racer.s = racer.contactS = station;
      racer.branch = branch;
      racer.position.copy(frame.p).y += 2.2;
      racer.grounded = true;
      racer.speed = speed;
      racer.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      racer.pitch = -Math.asin(frame.tangent.y);
      racer.velocity.copy(frame.tangent).multiplyScalar(speed);
    }
    window.takeApproach = (u, branch) => {
      world.resize();
      world.setView("chase");
      world.camera.up.set(0, 1, 0);
      const speed = 150;
      for (let j = 40; j >= 0; j -= 5) {
        position(race.player, u * track.length - j, branch, speed);
        world.draw(race, 5 / speed);
      }
      return {
        name: track.config.name,
        u,
        branch,
        ...world.renderer.info.render,
      };
    };
    window.startFlight = () => {
      world.resize();
      world.setView("chase");
      world.camera.up.set(0, 1, 0);
      const flight = new Race(track, 0, "trial", 0, world.environment.terrain);
      flight.countdown = 0;
      const s = (track.config.jump - 0.018) * track.length;
      position(flight.player, s, 0, CRAFT[0].speed * flight.classSpec.pace);
      flight.player.gate = Math.floor((s / track.length) * 32) + 1;
      flight.player.weapon = "TURBO";
      flight.fire(flight.player);
      world.setupRacers(flight, CRAFT);
      let airborne = false;
      let absentDeck = false;
      window.advanceFlight = (mark) => {
        for (let step = 0; step < 720; step++) {
          const grounded = flight.player.grounded;
          for (let i = 0; i < 4; i++)
            flight.update(1 / 120, {
              throttle: true,
              steer: 0,
              air: 0,
              brake: false,
              pitch: 0,
            });
          if (!flight.player.grounded) {
            airborne = true;
            absentDeck ||= track.gap(flight.player.contactS / track.length);
          }
          world.draw(flight, 1 / 30);
          const status = {
            airborne,
            absentDeck,
            landed: airborne && !grounded && flight.player.grounded,
            u: flight.player.contactS / track.length,
            shield: flight.player.shield,
            calls: world.renderer.info.render.calls,
            triangles: world.renderer.info.render.triangles,
          };
          if (
            mark === "air"
              ? absentDeck && !flight.player.grounded
              : status.landed
          )
            return status;
        }
        throw Error(`Flight did not reach ${mark}`);
      };
    };
  });
  for (const [name, width, height] of [
    ["desktop", 1000, 625],
    ["portrait", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [zone, u, branch] of [
      ["boulevard", 0.062, 0],
      ["marina", 0.231, 0],
      ["bore", 0.35, -1],
      ["skyway", 0.371, 1],
      ["cliff-hotels", 0.55, 0],
      ["approach", 0.802, 0],
      ["airport", 0.848, 0],
      ["runout", 0.881, 0],
    ]) {
      const row = await page.evaluate(
        ({ u, branch }) => window.takeApproach(u, branch),
        { u, branch },
      );
      if (!process.env.BASELINE) expect(row.name).toBe("PALM BREAKER");
      rows.push({ ...row, viewport: name, zone });
      await page
        .locator("canvas")
        .screenshot({ path: `${out}/${name}-${zone}.png` });
    }
    await page.evaluate(() => window.startFlight());
    const air = await page.evaluate(() => window.advanceFlight("air"));
    expect(air.absentDeck).toBe(true);
    await page
      .locator("canvas")
      .screenshot({ path: `${out}/${name}-airborne.png` });
    const landing = await page.evaluate(() => window.advanceFlight("landing"));
    expect(landing.landed).toBe(true);
    expect(landing.shield).toBe(100);
    expect(landing.u).toBeLessThan(0.9);
    rows.push({ viewport: name, air, landing });
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(rows, null, 2));
}
