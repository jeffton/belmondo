import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const output = process.env.VIADUCT_CAPTURES;

try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 625 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__viaduct__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__viaduct__.html`);
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [
      { World },
      { Race, CRAFT },
      { makeTrack, TRACK_INDEX },
      { playerPilot },
      THREE,
    ] = await Promise.all([
      import("/src/world.ts"),
      import("/src/race.ts"),
      import("/src/track.ts"),
      import("/tests/helpers/player-pilot.js"),
      import(threePath),
    ]);
    const world = new World(document.querySelector("canvas"));
    const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
    const loaded = new Promise((resolve, reject) => {
      THREE.DefaultLoadingManager.onLoad = resolve;
      THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
    });
    world.build(track);
    await loaded;
    const startRace = (u) => {
      const race = new Race(track, 1, "trial", 0, world.environment.terrain);
      world.setupRacers(race, CRAFT);
      const s = u * track.length;
      const f = track.frame(s);
      const { player } = race;
      race.countdown = 0;
      player.contactS = s;
      player.s = s;
      player.position.copy(f.p).addScaledVector(f.up, 2.2);
      player.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      player.velocity.copy(f.tangent).multiplyScalar(120);
      world.cameraReady = false;
      world.cameraForward = null;
      return race;
    };
    window.fixture = { world, track, playerPilot, startRace };
  });
  for (const quality of ["retro", "high"]) {
    await page.evaluate((quality) => {
      const fixture = window.fixture;
      fixture.world.quality = quality;
      fixture.world.resize();
      fixture.race = fixture.startRace(0.704);
    }, quality);
    for (const [view, target] of [
      ["chase", 0.728],
      ["seaward", 0.755],
      ["landward", 0.78],
      ["exit", 0.802],
      ["undercrossing", 0],
    ]) {
      const sample = await page.evaluate(
        ([view, target]) => {
          const { world, track, playerPilot, startRace } = window.fixture;
          const lower = track.config.sections.crossings[0].lowerU;
          if (view === "undercrossing") target = lower + 0.002;
          const race =
            view === "undercrossing"
              ? startRace(lower - 0.012)
              : window.fixture.race;
          const { player } = race;
          for (
            let step = 0;
            player.contactS / track.length < target && step < 1400;
            step++
          ) {
            race.update(1 / 120, playerPilot(track, player, 0, 0));
            if (player.recoveredThisStep)
              throw new Error("Rescue on the viaduct");
          }
          world.draw(race, 1 / 60);
          if (view === "seaward" || view === "landward") {
            const f = track.frame(0.754 * track.length);
            const side = view === "seaward" ? 1 : -1;
            const camera = world.camera.clone();
            camera.position
              .copy(f.p)
              .addScaledVector(f.right, side * 192)
              .addScaledVector(f.tangent, -126);
            camera.position.y -= 48;
            camera.lookAt(f.p.x, f.p.y - 26, f.p.z);
            world.renderer.render(world.scene, camera);
          }
          return {
            progress: player.contactS / track.length,
            target,
            canvas: world.renderer.domElement.width,
            calls: world.renderer.info.render.calls,
            triangles: world.renderer.info.render.triangles,
          };
        },
        [view, target],
      );
      expect(sample.progress).toBeGreaterThanOrEqual(sample.target);
      expect(sample.canvas).toBe(quality === "retro" ? 550 : 1000);
      expect(sample.calls).toBeGreaterThan(0);
      console.log(quality, view, sample);
      if (output)
        await page.screenshot({ path: `${output}/${quality}-${view}.png` });
    }
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
