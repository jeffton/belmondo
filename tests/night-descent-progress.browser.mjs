import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 625 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__descent_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}__descent_fixture__.html`);
  const result = await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [
      { World },
      { Race, CRAFT },
      { makeTrack, TRACK_INDEX },
      fixture,
      THREE,
    ] = await Promise.all([
      import("/src/world.ts"),
      import("/src/race.ts"),
      import("/src/track.ts"),
      import("/tests/helpers/night-descent.js"),
      import(threePath),
    ]);
    const { advanceNightDescent, descentStep, startNightDescent } = fixture;
    const world = new World(document.querySelector("canvas"));
    try {
      world.quality = "retro";
      world.resize();
      const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
      world.build(track);
      const race = new Race(track, 1, "trial", 0, world.environment.terrain);
      startNightDescent(race);
      world.setupRacers(race, CRAFT);
      await loaded;
      const r = race.player;
      const rendered = [];
      const draw = (phase) => {
        world.draw(race, 1 / 60);
        rendered.push({
          phase,
          u: r.contactS / track.length,
          gate: r.gate,
          lap: r.lap,
          calls: world.renderer.info.render.calls,
          error: world.ships[0].position.distanceTo(r.position),
        });
      };
      draw("approach");
      for (let step = 0; step < 600; step++) {
        advanceNightDescent(race);
        if (r.recoveredThisStep) throw new Error("False rescue on descent");
        if (step === 160 && !r.grounded) draw("outside");
        if (r.grounded) {
          draw("landing");
          break;
        }
      }
      for (
        let step = 0;
        r.contactS < 1.469 * track.length && step < 120 * 90;
        step++
      ) {
        advanceNightDescent(race);
        if (r.recoveredThisStep) throw new Error("False rescue after landing");
        race.events.length = 0;
      }
      const checkpoint = r.checkpoint.s;
      for (let step = 0; step < 720; step++) {
        race.update(descentStep, { throttle: false, airLeft: 1, airRight: 1 });
        if (step === 300 && !r.grounded) draw("short jump");
        if (r.recoveredThisStep) {
          draw("rescue");
          break;
        }
      }
      const canvas = world.renderer.domElement;
      return {
        rendered,
        checkpoint: checkpoint / track.length,
        laps: race.laps.length,
        resolution: [canvas.width, canvas.height],
      };
    } finally {
      world.renderer.dispose();
    }
  });

  expect(errors).toEqual([]);
  expect(result.resolution[0]).toBeGreaterThan(0);
  expect(result.resolution[0]).toBeLessThan(1000);
  expect(result.rendered.map(({ phase }) => phase)).toEqual([
    "approach",
    "outside",
    "landing",
    "short jump",
    "rescue",
  ]);
  expect(result.rendered[1].gate).toBe(26);
  expect(result.rendered[2].gate).toBe(28);
  expect(result.rendered[2].u).toBeCloseTo(0.9026, 3);
  expect(result.rendered[4].u).toBe(result.checkpoint);
  expect(result.rendered[4].lap).toBe(2);
  expect(result.laps).toBe(1);
  for (const frame of result.rendered) {
    expect(frame.calls).toBeGreaterThan(0);
    expect(frame.error).toBeLessThan(0.001);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await server.close();
}
