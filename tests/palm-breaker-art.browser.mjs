import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";

const root = process.env.SOURCE_ROOT || process.cwd();
const out = process.env.ARTIFACT_DIR || "test-artifacts/palm-breaker-art";
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0 },
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
      const track = makeTrack(TRACK_INDEX.COAST);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = reject;
      });
      world.build(track);
      await loaded;
      window.fixture = { world, track, Race, CRAFT, playerPilot };
    });
    const targets = (start, end) =>
      process.env.DENSE
        ? Array.from(
            { length: 13 },
            (_, i) => +(start + ((end - start) * i) / 12).toFixed(5),
          )
        : [start, +(start + (end - start) / 2).toFixed(5), end];
    for (const view of ["chase", "first-person"])
      for (const [zone, branch, start, marks] of [
        ["upper", 1, 0.37, targets(0.375, 0.41)],
        ["lower", -1, 0.37, targets(0.375, 0.41)],
        ["institute", 0, 0.545, targets(0.55, 0.58)],
      ]) {
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
        for (const target of marks) {
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
