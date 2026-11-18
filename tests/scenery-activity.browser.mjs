import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Real LOWRES scene and chase camera, swept at 150 m/s along a matched line.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const out = process.env.ARTIFACT_DIR || "test-artifacts/scenery-activity";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const report = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 625 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__scenery-activity_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__scenery-activity_fixture__.html`);
  const count = await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const threeURL = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [
      THREE,
      { World },
      { Race, CRAFT },
      { makeTrack, TRACKS },
      { scenerySite },
    ] = await Promise.all([
      import(threeURL),
      import("/src/world.ts"),
      import("/src/race.ts"),
      import("/src/track.ts"),
      import("/src/scenery-activity.ts"),
    ]);
    let world;
    window.buildCourse = async (index) => {
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
        THREE.DefaultLoadingManager.onLoad = resolve;
      });
      world ??= new World(document.querySelector("canvas"));
      const track = makeTrack(index);
      const race = new Race(track, 0, "trial");
      const player = race.player;
      race.countdown = 0;
      world.build(track);
      world.setupRacers(race, CRAFT);
      await loaded;
      function draw(station, branch) {
        const speed = 150;
        const frame = track.frame(station, branch);
        player.s = player.contactS = station;
        player.branch = branch;
        player.position.copy(frame.p);
        player.position.y += 2.2;
        player.grounded = true;
        player.speed = speed;
        player.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
        player.pitch = -Math.asin(frame.tangent.y);
        player.velocity.copy(frame.tangent).multiplyScalar(speed);
        world.draw(race, 1 / 30);
      }
      return { track, world, draw };
    };
    window.sceneryPass = (fixture, phase, capture = null) => {
      const { track, world, draw } = fixture;
      const site = scenerySite(track, world.environment);
      const actors = [],
        blockers = [];
      world.scene.updateMatrixWorld(true);
      world.scene.traverse((obj) => {
        if (!obj.isMesh || obj.material?.transparent) return;
        for (let p = obj; p; p = p.parent) if (world.ships.includes(p)) return;
        if (obj.name === "scenery-moving-part") actors.push(obj);
        blockers.push(obj);
      });
      world.resize();
      world.setView("chase");
      world.camera.up.set(0, 1, 0);
      world.time = phase;
      const ray = new THREE.Raycaster(),
        bounds = new THREE.Box3();
      let best = null,
        frames = 0;
      for (let distance = 330; distance >= 24; distance -= 6) {
        const s = site.u * track.length - distance;
        const [lo, hi] = track.config.split;
        draw(s, s / track.length > lo && s / track.length < hi ? site.side : 0);
        if (distance === capture) {
          const withActivity = { ...world.renderer.info.render };
          world.scenery.root.visible = false;
          world.renderer.render(world.scene, world.camera);
          const withoutActivity = { ...world.renderer.info.render };
          world.scenery.root.visible = true;
          world.renderer.render(world.scene, world.camera);
          return {
            calls: withActivity.calls - withoutActivity.calls,
            triangles: withActivity.triangles - withoutActivity.triangles,
          };
        }
        if (capture || distance > 294) continue;
        let seen = 0,
          score = 0;
        const pose = [];
        for (const obj of actors) {
          bounds.setFromObject(obj);
          const center = bounds.getCenter(new THREE.Vector3());
          const screen = center.clone().project(world.camera);
          if (
            Math.abs(screen.x) > 0.8 ||
            Math.abs(screen.y) > 0.8 ||
            Math.abs(screen.z) > 1
          )
            continue;
          // Probe actual triangles on the moving model. Count a hit only if the
          // ray reaches that model first, including against its own housing.
          const { index, attributes } = obj.geometry;
          const probes = new THREE.Vector3();
          const vertex = new THREE.Vector3();
          const visible = [];
          for (let i = 0; i < index.count; i += 21) {
            probes.set(0, 0, 0);
            for (let k = 0; k < 3; k++)
              probes.add(
                vertex.fromBufferAttribute(
                  attributes.position,
                  index.getX(i + k),
                ),
              );
            probes.multiplyScalar(1 / 3).applyMatrix4(obj.matrixWorld);
            const screenPoint = probes.clone().project(world.camera);
            if (
              Math.abs(screenPoint.x) > 0.94 ||
              Math.abs(screenPoint.y) > 0.91 ||
              Math.abs(screenPoint.z) > 1
            )
              continue;
            const delta = probes.sub(world.camera.position);
            ray.far = delta.length() + 0.05;
            ray.set(world.camera.position, delta.normalize());
            if (ray.intersectObjects(blockers, false)[0]?.object === obj)
              visible.push(screenPoint);
            if (visible.length === 3) break;
          }
          if (visible.length !== 3) continue;
          seen++;
          const depth = center.distanceTo(world.camera.position);
          score +=
            (bounds.getSize(new THREE.Vector3()).length() / depth) *
            (1 - 0.52 * Math.abs(screen.x));
          pose.push(...obj.matrixWorld.elements);
        }
        if (seen === 0) continue;
        frames++;
        if (!best || score > best.score) best = { distance, seen, score, pose };
      }
      return { course: track.config.name, frames, best };
    };
    return TRACKS.length;
  });
  for (let index = 0; index < count; index++) {
    if (process.env.COURSE && Number(process.env.COURSE) !== index) continue;
    await page.evaluate(async (i) => {
      window.fixture = await window.buildCourse(i);
    }, index);
    for (const [viewport, width, height] of [
      ["desktop", 1000, 625],
      ["portrait", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const passes = [];
      for (const phase of [2, 5]) {
        const row = await page.evaluate(
          (t) => window.sceneryPass(window.fixture, t),
          phase,
        );
        if (row.best && phase === 2) {
          row.budget = await page.evaluate(
            ({ t, d }) => window.sceneryPass(window.fixture, t, d),
            { t: phase, d: row.best.distance },
          );
          await page
            .locator("canvas")
            .screenshot({ path: out + "/" + index + "-" + viewport + ".png" });
        }
        passes.push(row);
      }
      const [first, second] = passes;
      report.push({
        course: first.course,
        viewport,
        frames: passes.map((p) => p.frames),
        budget: first.budget,
        distinctPoses:
          !!first.best &&
          !!second.best &&
          JSON.stringify(first.best.pose) !== JSON.stringify(second.best.pose),
      });
      console.log(JSON.stringify(report.at(-1)));
    }
  }
  expect(errors).toEqual([]);
  for (const row of report) {
    for (const frames of row.frames)
      expect(frames, row.course + " " + row.viewport).toBeGreaterThanOrEqual(4);
    expect(row.distinctPoses).toBe(true);
    expect(row.budget.calls).toBeGreaterThan(0);
    expect(row.budget.calls).toBeLessThanOrEqual(6);
    expect(row.budget.triangles).toBeLessThanOrEqual(650);
  }
} finally {
  await browser.close();
  await writeFile(
    out + "/report.json",
    JSON.stringify({ report, errors }, null, 2),
  );
}
