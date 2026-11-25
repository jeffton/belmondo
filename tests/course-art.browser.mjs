import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";

const zones = {
  COAST: [
    ["skyway", 1, 0.37, [0.38, 0.39, 0.407]],
    ["bore", -1, 0.37, [0.38, 0.39, 0.407]],
    ["institute", 0, 0.545, [0.55, 0.565, 0.58]],
  ],
  MONSOON: [
    ["chamber", 0, 0.292, [0.301, 0.333]],
    ["works", 0, 0.39, [0.399, 0.465]],
  ],
  WHITEOUT: [["optical-wing", 0, 0.299, [0.309, 0.329, 0.351]]],
  SOLAR: [["receiver", 0, 0.649, [0.662, 0.681]]],
  FAULTLINE: [["processing", 0, 0.569, [0.585, 0.635]]],
  CINDERLINE: [
    ["flight", 0, 0.51, [0.53, 0.545, 0.556, 0.565]],
    ["gorge", -1, 0.803, [0.815, 0.83]],
    ["rim", 1, 0.803, [0.815, 0.83]],
  ],
  NOCTILUCENT: [["harbor", 0, 0.73, [0.74, 0.75, 0.76]]],
  VESPER: [["freight", 0, 0.806, [0.82, 0.88]]],
};
const course = process.env.COURSE || "COAST";
const marks = process.env.ZONES ? JSON.parse(process.env.ZONES) : zones[course];
const root = process.env.SOURCE_ROOT || process.cwd();
const out = process.env.ARTIFACT_DIR || `test-artifacts/course-art/${course}`;
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = [];
try {
  for (const [viewport, width, height] of [
    ["desktop", 1000, 625],
    ["portrait", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__art__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
      }),
    );
    await page.goto(`${server.resolvedUrls.local[0]}__art__.html`);
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
        THREE.DefaultLoadingManager.onError = reject;
      });
      world.build(track);
      await loaded;
      window.fixture = { world, track, Race, CRAFT, playerPilot };
    }, course);
    const views = process.env.COMPACT
      ? [viewport === "desktop" ? "chase" : "first-person"]
      : ["chase", "first-person"];
    for (const view of views)
      for (const [zone, branch, start, targets] of marks) {
        await page.evaluate(
          ({ view, branch, start }) => {
            const f = window.fixture,
              { world, track, Race, CRAFT } = f;
            const race = new Race(
              track,
              1,
              "trial",
              0,
              world.environment.terrain,
            );
            f.race = race;
            world.setupRacers(race, CRAFT);
            world.quality = "retro";
            world.resize();
            world.setView(view);
            const p = race.player,
              s = start * track.length,
              frame = track.frame(s, branch);
            race.countdown = 0;
            p.gate = Math.floor((s / track.length) * 32) + 1;
            p.branch = p.contactBranch = branch;
            p.s = p.contactS = s;
            p.position.copy(frame.p).addScaledVector(frame.up, 2.2);
            p.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
            p.velocity.copy(frame.tangent).multiplyScalar(120);
            world.cameraReady = false;
            world.cameraForward = null;
            f.steps = 0;
          },
          { view, branch, start },
        );
        for (const target of targets) {
          const data = await page.evaluate(
            ({ target, branch }) => {
              const { world, track, race, playerPilot } = window.fixture,
                p = race.player;
              while (
                p.contactS < target * track.length &&
                window.fixture.steps < 3600
              ) {
                race.update(1 / 120, playerPilot(track, p, branch, 0));
                window.fixture.steps++;
                if (p.recoveredThisStep) throw Error("Unexpected recovery");
                if (window.fixture.steps % 2 === 0) world.draw(race, 1 / 60);
              }
              world.draw(race, 1 / 60);
              return {
                target,
                progress: p.contactS / track.length,
                steps: window.fixture.steps,
                position: p.position.toArray(),
                speed: p.speed,
                grounded: p.grounded,
                shield: p.shield,
                branch: p.branch,
                calls: world.renderer.info.render.calls,
                triangles: world.renderer.info.render.triangles,
                canvas: [
                  world.renderer.domElement.width,
                  world.renderer.domElement.height,
                ],
              };
            },
            { target, branch },
          );
          const name = `${viewport}-${view}-${zone}-${target}`;
          assert(data.progress >= target && data.branch === branch, name);
          if (course === "CINDERLINE" && zone === "flight") {
            assert.equal(
              data.grounded,
              target < 0.538 || target >= 0.556,
              name,
            );
            assert.equal(data.shield, 100, name);
          }
          assert.deepEqual(
            data.canvas,
            [Math.round(width * 0.55), Math.round(height * 0.55)],
            name,
          );
          await page.screenshot({ path: `${out}/${name}.png` });
          report.push({ name, ...data });
        }
      }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
