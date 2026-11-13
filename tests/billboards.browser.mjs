// Run only with an exclusive GPU grant; no shared Batty browser is used.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

if (process.env.BILLBOARD_GPU_GRANTED !== "1")
  throw new Error("An exclusive GPU grant is required");
const output = process.env.OUTPUT_DIR;
const source = process.env.SOURCE_URL;
if (!output || !source || !process.env.COURSES)
  throw new Error(
    "OUTPUT_DIR, SOURCE_URL and COURSES required (one course per run)",
  );
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  for (const [name, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["mobile", 844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/__billboards__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh;image-rendering:pixelated}</style><canvas></canvas>',
      }),
    );
    await page.goto(`${source}/__billboards__.html`);
    await page.evaluate(async () => {
      const code = await (await fetch("/src/world.js")).text();
      const three = code.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)[1];
      const [
        { World },
        { Race, CRAFT },
        { makeTrack },
        { getTrackAdvertisingLayout },
        THREE,
      ] = await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import("/src/advertising.js"),
        import(three),
      ]);
      window.adQA = {
        world: new World(document.querySelector("canvas")),
        Race,
        CRAFT,
        makeTrack,
        getTrackAdvertisingLayout,
        THREE,
      };
    });
    for (const course of process.env.COURSES.split(",").map(Number)) {
      await page.evaluate(async (course) => {
        const q = window.adQA;
        const ready = new Promise((resolve, reject) => {
          q.THREE.DefaultLoadingManager.onLoad = resolve;
          q.THREE.DefaultLoadingManager.onError = (url) =>
            reject(new Error(url));
        });
        q.track = q.makeTrack(course);
        q.race = new q.Race(q.track, 0, "trial");
        q.race.countdown = 0;
        q.world.build(q.track);
        q.world.setupRacers(q.race, q.CRAFT);
        q.layout = q.getTrackAdvertisingLayout(q.track);
        await ready;
      }, course);
      for (let panel = 0; panel < 4; panel++) {
        for (const distance of [160, 45]) {
          const measurement = await page.evaluate(
            ({ panel, distance }) => {
              const { world, track, race, layout, THREE } = window.adQA;
              const spec = layout[panel];
              const s = spec.u * track.length - distance;
              const branch =
                s / track.length > track.config.split[0] &&
                s / track.length < track.config.split[1]
                  ? spec.side
                  : 0;
              const f = track.frame(s, branch),
                r = race.player;
              r.s = r.contactS = s;
              r.branch = branch;
              r.position.copy(f.p);
              r.position.y += 2.2;
              r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
              r.pitch = -Math.atan2(
                f.tangent.y,
                Math.hypot(f.tangent.x, f.tangent.z),
              );
              r.yawRate = 0;
              r.velocity.copy(f.tangent).multiplyScalar(110);
              r.speed = 110;
              world.setView("chase");
              for (let n = 0; n < 8; n++) world.draw(race, 1 / 60);
              const center = spec.center.clone().project(world.camera);
              return {
                course: track.config.name,
                panel,
                brand: spec.brand,
                u: spec.u,
                branch,
                distance,
                quality: world.quality,
                projectedCenter: center.toArray(),
                calls: world.renderer.info.render.calls,
                triangles: world.renderer.info.render.triangles,
                textures: world.renderer.info.memory.textures,
              };
            },
            { panel, distance },
          );
          const shot = `${name}-${course}-${panel}-${distance}`;
          await page.screenshot({
            path: `${output}/${shot}.png`,
            timeout: 60000,
          });
          results.push({ shot, ...measurement });
        }
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
}
console.log(
  `Captured ${results.length} real race views; no page errors; browser closed.`,
);
