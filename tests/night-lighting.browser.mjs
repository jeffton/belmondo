import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const output = process.env.NIGHT_CAPTURES;

try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 625 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__night_lighting__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__night_lighting__.html`);
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
    const startRace = (u, branch) => {
      const race = new Race(track, 1, "trial", 0, world.environment.terrain);
      world.setupRacers(race, CRAFT);
      const s = u * track.length;
      const f = track.frame(s, branch);
      const { player } = race;
      race.countdown = 0;
      player.branch = branch;
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
    for (const [view, target, branch = 0, side = 0] of [
      ["terminal", 0.986],
      ["freight", 0.112],
      ["quay", 0.23],
      ["tunnel-in", 0.332, -1],
      ["outer-bench", 0.376, 1],
      ["takeoff", 0.461],
      ["landing", 0.51],
      ["switchback", 0.595],
      ["viaduct-chase", 0.741],
      ["viaduct-seaward", 0.725, 0, 1],
      ["viaduct-landward", 0.76, 0, -1],
      ["descent-entry", 0.855],
      ["descent", 0.875],
      ["return", 0.945],
    ]) {
      const sample = await page.evaluate(
        ([quality, target, branch, side]) => {
          const { world, track, startRace, playerPilot } = window.fixture;
          if (world.quality !== quality) {
            world.quality = quality;
            world.resize();
          }
          const race = startRace(target - 0.003, branch);
          const { player } = race;
          for (
            let step = 0;
            player.contactS / track.length < target && step < 160;
            step++
          ) {
            race.update(1 / 120, playerPilot(track, player, 0, 0));
            if (player.recoveredThisStep) throw new Error("Unexpected rescue");
          }
          for (let frame = 0; frame < 3; frame++) world.draw(race, 1 / 60);
          if (side) {
            const f = track.frame(target * track.length, branch);
            const camera = world.camera.clone();
            camera.position
              .copy(f.p)
              .addScaledVector(f.right, side * 105)
              .addScaledVector(f.tangent, -78)
              .addScaledVector(f.up, 23);
            camera.lookAt(f.p);
            world.renderer.render(world.scene, camera);
          }
          return {
            progress: player.contactS / track.length,
            canvas: world.renderer.domElement.width,
            calls: world.renderer.info.render.calls,
            triangles: world.renderer.info.render.triangles,
          };
        },
        [quality, target, branch, side],
      );
      expect(sample.progress).toBeGreaterThanOrEqual(target);
      expect(sample.canvas).toBe(quality === "retro" ? 550 : 1000);
      expect(sample.calls).toBeGreaterThan(0);
      console.log(quality, view, JSON.stringify(sample));
      if (output)
        await page.screenshot({ path: `${output}/${quality}-${view}.png` });
    }
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
