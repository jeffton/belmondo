import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

// Same production World/Race and render settings as the night viaduct fixture.
const sites = [
  ["COAST", "inlet", 0.37, 1],
  ["MONSOON", "island", 0.445, 0],
  ["MONSOON", "dam", 0.108, 0],
  ["WHITEOUT", "snow", 0.803, -1],
  ["WHITEOUT", "ravine", 0.217, 0],
  ["SOLAR", "runway", 0.635, 0],
  ["FAULTLINE", "hall", 0.278, 1],
  ["FAULTLINE", "climb", 0.865, 0],
  ["CINDERLINE", "shelf", 0.823, 1],
  ["NOCTILUCENT", "hill", 0.37, 1],
  ["NOCTILUCENT", "viaduct", 0.74, 0],
  ["VESPER", "fork", 0.32, 1],
  ["VESPER", "market", 0.55, 0],
];

const drives = new Map([
  ["inlet", [0.329, 0.414]],
  ["ravine", [0.208, 0.235]],
  ["underpass", [0.495, 0.518]],
  ["shelf", [0.805, 0.852]],
]);
const selectedSites = process.env.AUDIT
  ? sites
  : [
      ...sites.filter(([, name]) => drives.has(name)),
      ["WHITEOUT", "underpass", 0.507, 0],
    ];

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  for (const course of new Set(selectedSites.map(([course]) => course))) {
    const selected = selectedSites.filter(([name]) => name === course);
    if (process.env.COURSES && !process.env.COURSES.split(",").includes(course))
      continue;
    const page = await browser.newPage({
      viewport: { width: 1000, height: 625 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__structures__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
      }),
    );
    await page.goto(`${server.resolvedUrls.local[0]}__structures__.html`);
    await page.evaluate(async (course) => {
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
      const track = makeTrack(TRACK_INDEX[course]);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
      world.build(track);
      await loaded;
      const race = new Race(track, 1, "trial", 0, world.environment.terrain);
      world.setupRacers(race, CRAFT);
      window.fixture = { world, track, race, playerPilot };
    }, course);
    for (const [, site, u, branch] of selected) {
      for (const quality of process.env.AUDIT ? ["high"] : ["retro", "high"]) {
        for (const view of process.env.AUDIT ? ["side"] : ["side", "chase"]) {
          const sample = await page.evaluate(
            ({ u, branch, quality, view, site, drive }) => {
              const { world, track, race, playerPilot } = window.fixture;
              world.quality = quality;
              world.resize();
              const { player } = race;
              const s =
                (view === "chase" ? drive[0] : u - 0.006) * track.length;
              const start = track.frame(s, branch);
              race.countdown = 0;
              player.branch = branch;
              player.contactBranch = branch;
              player.s = player.contactS = s;
              player.position.copy(start.p).addScaledVector(start.up, 2.2);
              player.yaw = Math.atan2(start.tangent.x, start.tangent.z);
              player.velocity.copy(start.tangent).multiplyScalar(120);
              world.cameraReady = false;
              world.cameraForward = null;
              if (view === "chase") {
                for (
                  let step = 0;
                  player.contactS < drive[1] * track.length && step < 1800;
                  step++
                ) {
                  race.update(1 / 120, playerPilot(track, player, branch, 0));
                  if (player.recoveredThisStep)
                    throw new Error("Unexpected recovery on elevated road");
                }
                world.draw(race, 1 / 60);
              } else {
                world.draw(race, 1 / 60);
                const f = track.frame(u * track.length, branch);
                const camera = world.camera.clone();
                camera.position
                  .copy(f.p)
                  .addScaledVector(
                    f.right,
                    site === "shelf" ? -96 : site === "inlet" ? 265 : 132,
                  )
                  .addScaledVector(f.tangent, site === "inlet" ? -300 : -155);
                camera.position.y += site === "inlet" ? -72 : 26;
                camera.lookAt(
                  f.p.x,
                  f.p.y - (site === "inlet" ? 90 : 16),
                  f.p.z,
                );
                world.renderer.render(world.scene, camera);
              }
              return {
                progress: player.contactS / track.length,
                canvas: world.renderer.domElement.width,
                calls: world.renderer.info.render.calls,
                triangles: world.renderer.info.render.triangles,
              };
            },
            { u, branch, quality, view, site, drive: drives.get(site) },
          );
          if (view === "chase")
            expect(sample.progress).toBeGreaterThanOrEqual(drives.get(site)[1]);
          expect(sample.canvas).toBe(quality === "retro" ? 550 : 1000);
          expect(sample.calls).toBeGreaterThan(0);
          console.log(course, site, quality, view, sample);
          if (process.env.STRUCTURE_CAPTURES)
            await page.screenshot({
              path: `${process.env.STRUCTURE_CAPTURES}/${course}-${site}-${quality}-${view}.png`,
            });
        }
      }
    }
    expect(errors).toEqual([]);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
