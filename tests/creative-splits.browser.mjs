import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Renderer audit, not a phone benchmark. One legal stationary fixture before
// the fork, followed only by production Race.update + production AI steering.
const [
  base = "http://127.0.0.1:5189",
  label = "baseline",
  courseArg = "2",
  branchArg = "-1",
  layout = "desktop",
] = process.argv.slice(2);
const course = Number(courseArg),
  branch = Number(branchArg);
const out = `/var/tmp/creative-splits-visual/${label}/${course}/${branch}/${layout}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport:
      layout === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__creative_visual__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><style>body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;left:6px;bottom:6px;color:white;background:#000b;font:12px monospace;padding:5px}</style><canvas></canvas><div id="label"></div>',
    }),
  );
  await page.goto(`${base}/__creative_visual__.html`);
  const setup = await page.evaluate(
    async ({ course, branch, label, layout }) => {
      const src = await (await fetch("/src/world.ts")).text();
      const threePath = src.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
        await Promise.all([
          import("/src/world.ts"),
          import("/src/race.ts"),
          import("/src/track.ts"),
          import(threePath),
        ]);
      const world = new World(document.querySelector("canvas"));
      const track = makeTrack(course);
      world.build(track);
      const race = new Race(track, 0, "trial", 0, world.environment.terrain);
      const p = race.player;
      // Fixture: legal centreline, 420 units BEFORE split, zero speed. No subsequent
      // position, velocity, branch, grounded or progress mutations are permitted.
      const start = track.config.split[0] * track.length - 420;
      const f = track.frame(start, 0);
      p.s = p.contactS = start;
      p.branch = 0;
      p.gate = Math.floor(((start - track.finishS) / track.length) * 32) + 1;
      p.checkpoint = { s: start, branch: 0, gate: p.gate };
      p.position.copy(f.p);
      p.position.y += 2.2;
      p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      p.pitch = -Math.asin(f.tangent.y);
      p.velocity.set(0, 0, 0);
      p.speed = 0;
      p.grounded = true;
      p.h = 0;
      p.id = branch < 0 ? 1 : 2;
      p.aiFire = Infinity;
      race.countdown = 0;
      world.setupRacers(race, CRAFT);
      // setupRacers addresses ships by array index; keep original mesh at AI id.
      world.ships[p.id] = world.ships[0];
      let recoveries = 0;
      const recover = race.recover.bind(race);
      race.recover = (r) => {
        recoveries++;
        return recover(r);
      };
      const stages = [
        ["approach", start + 150],
        ["decision", track.config.split[0] * track.length + 15],
        [
          "branch-entry",
          (track.config.split[0] +
            (track.config.split[1] - track.config.split[0]) * 0.24) *
            track.length,
        ],
        [
          "branch-middle",
          (track.config.split[0] +
            (track.config.split[1] - track.config.split[0]) * 0.55) *
            track.length,
        ],
        [
          "branch-exit",
          (track.config.split[0] +
            (track.config.split[1] - track.config.split[0]) * 0.83) *
            track.length,
        ],
        ["merge", (track.config.split[1] + 0.012) * track.length],
      ];
      const metrics = [],
        trace = [],
        video = [];
      window.audit = {
        world,
        race,
        track,
        p,
        stages,
        metrics,
        trace,
        video,
        step: 0,
        recoveries: () => recoveries,
      };
      document.querySelector("#label").textContent =
        `${label} | course ${course} | branch ${branch} | ${layout} | legal pre-fork fixture → real physics`;
      return {
        name: track.config.name,
        length: track.length,
        split: track.config.split,
        finishS: track.finishS,
        fixture: { s: start, speed: 0, branch: 0, gate: p.gate },
        threePath,
      };
    },
    { course, branch, label, layout },
  );
  await page.waitForTimeout(700);
  const shots = [];
  for (let n = 0; n < 6; n++) {
    const state = await page.evaluate(() => {
      const a = window.audit,
        [name, target] = a.stages.shift();
      let count = 0;
      while (a.p.contactS < target && count < 120 * 45 && !a.p.eliminated) {
        a.race.update(1 / 120, {
          throttle: false,
          steer: 0,
          air: 0,
          brake: false,
        });
        a.step++;
        count++;
        if (a.step % 12 === 0) {
          const t = performance.now();
          a.world.draw(a.race, 0.1);
          a.metrics.push({
            ms: performance.now() - t,
            calls: a.world.renderer.info.render.calls,
            triangles: a.world.renderer.info.render.triangles,
          });
          if (a.step % 24 === 0)
            a.video.push(
              a.world.renderer.domElement
                .toDataURL("image/jpeg", 0.8)
                .split(",")[1],
            );
          a.trace.push({
            s: a.p.contactS,
            branch: a.p.branch,
            grounded: a.p.grounded,
            x: a.p.position.x,
            y: a.p.position.y,
            z: a.p.position.z,
            speed: a.p.speed,
          });
        }
      }
      a.world.draw(a.race, 1 / 30);
      const info = a.world.renderer.info.render;
      const expectedGate =
        Math.floor(((a.p.contactS - a.track.finishS) / a.track.length) * 32) +
        1;
      if (a.p.gate !== expectedGate)
        throw new Error(
          `Gate mismatch ${name}: ${a.p.gate} != ${expectedGate}`,
        );
      return {
        name,
        target,
        s: a.p.contactS,
        gate: a.p.gate,
        expectedGate,
        branch: a.p.branch,
        speed: a.p.speed,
        grounded: a.p.grounded,
        shield: a.p.shield,
        recoveries: a.recoveries(),
        simSeconds: a.step / 120,
        reached: a.p.contactS >= target,
        calls: info.calls,
        triangles: info.triangles,
      };
    });
    await page.screenshot({ path: `${out}/${state.name}.png` });
    shots.push(state);
    if (!state.reached) break;
  }
  const data = await page.evaluate(() => ({
    metrics: window.audit.metrics,
    trace: window.audit.trace,
    video: window.audit.video,
  }));
  await mkdir(`${out}/frames`, { recursive: true });
  for (let i = 0; i < data.video.length; i++)
    await writeFile(
      `${out}/frames/${String(i).padStart(4, "0")}.jpg`,
      Buffer.from(data.video[i], "base64"),
    );
  const videoFrames = data.video.length;
  delete data.video;
  const report = {
    base,
    label,
    course,
    branch,
    layout,
    ...setup,
    shots,
    ...data,
    videoFrames,
    videoFps: 5,
    errors,
  };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ out, setup, shots, frames: data.metrics.length, errors }),
  );
} finally {
  await browser.close();
}
