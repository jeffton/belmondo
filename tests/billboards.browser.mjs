import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Real World/LOWRES renderer, swept centerline approaches at race speed.
// Deterministic fixture placement isolates art and camera from driving AI.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
const out = process.env.ARTIFACT_DIR || "test-artifacts/billboards";
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
  await page.route("**/__billboards_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(`${url}/__billboards_fixture__.html`);
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
      { getTrackAdvertisingLayout },
    ] = await Promise.all([
      import(threeURL),
      import("/src/world.ts"),
      import("/src/race.ts"),
      import("/src/track.ts"),
      import("/src/advertising.ts"),
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
    window.runBillboardPass = ({ track, world, draw }) => {
      world.resize();
      const rows = [];
      const municipal = [];
      const occluders = [];
      world.scene.updateMatrixWorld(true);
      world.scene.traverse((obj) => {
        if (obj.name === "vesper-municipal-sign") {
          const center = obj.position.clone();
          const horizontal = new THREE.Vector3(1, 0, 0).applyQuaternion(
            obj.quaternion,
          );
          const corners = [-1, 1].flatMap((x) =>
            [-1, 1].map((y) =>
              center
                .clone()
                .addScaledVector(horizontal, x * 9)
                .add(new THREE.Vector3(0, y * 9, 0)),
            ),
          );
          municipal.push({
            kind: "municipal",
            center,
            horizontal,
            corners,
            u: obj.userData.station,
            side: 0,
            width: 18,
            ratio: 1,
          });
          return;
        }
        if (!obj.isMesh || obj.material?.transparent) return;
        // Omit the ad itself and view-dependent effects (shadow/glow/ships).
        for (let p = obj; p; p = p.parent) {
          if (
            p.name === "district-advertising" ||
            p.name === "roadside-advertising-supports" ||
            world.ships.includes(p)
          )
            return;
        }
        occluders.push(obj);
      });
      const ray = new THREE.Raycaster();
      for (const spec of [...getTrackAdvertisingLayout(track), ...municipal]) {
        world.setView("chase");
        world.camera.fov = 68 + 150 * 0.085;
        world.camera.up.set(0, 1, 0);
        const sides = track.config.split;
        const normal = spec.horizontal
          .clone()
          .cross(new THREE.Vector3(0, 1, 0));
        const faceCenter = spec.center
          .clone()
          .addScaledVector(normal, spec.kind ? 0 : 0.86);
        // Warm the moving chase camera at regular 5 m increments (150 m/s).
        for (let d = 230; d >= 190; d -= 5) {
          const s = spec.u * track.length - d;
          draw(
            s,
            s / track.length > sides[0] && s / track.length < sides[1]
              ? spec.side
              : 0,
          );
        }
        let best = null;
        let frames = 0;
        for (let d = 185; d >= 50; d -= 5) {
          const s = spec.u * track.length - d;
          draw(
            s,
            s / track.length > sides[0] && s / track.length < sides[1]
              ? spec.side
              : 0,
          );
          const pts = spec.corners.map((p) => p.clone().project(world.camera));
          const [x0, x1] = [
            Math.min(...pts.map((p) => p.x)),
            Math.max(...pts.map((p) => p.x)),
          ];
          const [y0, y1] = [
            Math.min(...pts.map((p) => p.y)),
            Math.max(...pts.map((p) => p.y)),
          ];
          const fits =
            x0 > -0.98 &&
            x1 < 0.98 &&
            y0 > -0.9 &&
            y1 < 0.98 &&
            pts.every((p) => Math.abs(p.z) < 1);
          const facing = normal.dot(
            world.camera.position.clone().sub(faceCenter).normalize(),
          );
          if (!fits || facing < 0.8) continue;
          const w = ((x1 - x0) * world.renderer.domElement.width) / 2;
          const h = ((y1 - y0) * world.renderer.domElement.height) / 2;
          const score = Math.min(w / (spec.ratio ?? 2.42), h);
          if (score < 11) continue;
          // Probe center and two glyph/art regions of the actual scene.
          const clear = [-0.34, 0, 0.34].every((x) => {
            const point = faceCenter
              .clone()
              .addScaledVector(spec.horizontal, x * spec.width);
            const delta = point.sub(world.camera.position);
            ray.set(world.camera.position, delta.clone().normalize());
            ray.far = delta.length() - 0.15;
            return !ray.intersectObjects(occluders, false).length;
          });
          if (!clear) continue;
          frames++;
          if (best && score <= best.score) continue;
          best = {
            station: spec.u,
            brand: spec.brand,
            distance: d,
            width: w,
            height: h,
            score,
            facing,
            draws: world.renderer.info.render.calls,
            screenshot: world.renderer.domElement
              .toDataURL("image/png")
              .split(",")[1],
          };
        }
        rows.push({
          kind: spec.kind ?? "billboard",
          station: spec.u,
          frames,
          best,
        });
      }
      return rows;
    };
    window.buildIndex = async (index) => {
      window.course = await window.buildCourse(index);
      return window.course.track.config.name;
    };
    window.runPass = () => window.runBillboardPass(window.course);
    window.disposePass = () => {
      world.disposeScene();
      world.renderer.dispose();
    };
    return TRACKS.length;
  });
  const viewports = [
    ["desktop", { width: 1000, height: 625 }],
    ["portrait", { width: 390, height: 844 }],
  ];
  const indexes = process.env.COURSE
    ? process.env.COURSE.split(",").map(Number)
    : Array.from({ length: count }, (_, i) => i);
  for (const index of indexes) {
    const course = await page.evaluate((i) => window.buildIndex(i), index);
    for (const [mode, size] of viewports) {
      await page.setViewportSize(size);
      const rows = await page.evaluate(() => window.runPass());
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.best) continue;
        await writeFile(
          `${out}/${index}-${mode}-${i}.png`,
          Buffer.from(row.best.screenshot, "base64"),
        );
        delete row.best.screenshot;
      }
      report.push({ index, course, mode, rows });
      console.log(
        course,
        mode,
        rows.map((r) => r.frames),
      );
    }
  }
  await page.evaluate(() => window.disposePass());
  expect(errors).toEqual([]);
  for (const { course, mode, rows } of report) {
    const localSigns = rows.filter((row) => row.kind === "municipal");
    if (course === "VESPER CIRCUIT") {
      expect(localSigns).toHaveLength(4);
      for (const sign of localSigns)
        expect(
          sign.frames,
          `${course} ${mode} municipal sign ${sign.station}`,
        ).toBeGreaterThanOrEqual(3);
    }
    for (const row of rows.filter((row) => row.kind === "billboard"))
      expect(
        row.frames,
        `${course} ${mode} billboard ${row.station}`,
      ).toBeGreaterThanOrEqual(3);
  }
} finally {
  await browser.close();
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ report, errors }, null, 2) + "\n",
  );
}
