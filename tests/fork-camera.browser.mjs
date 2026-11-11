import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
let result;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__fork_camera_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto("http://127.0.0.1:5178/__fork_camera_fixture__.html");
  result = await page.evaluate(async () => {
    const source = await (await fetch("/src/world.js")).text();
    const threePath = source.match(
      /from\s+["']([^"']*\/three\.js[^"']*)["']/,
    )[1];
    const [{ World }, { Race, CRAFT }, { makeTrack }, { hullExtent }, THREE] =
      await Promise.all([
        import("/src/world.js"),
        import("/src/race.js"),
        import("/src/track.js"),
        import("/src/contacts.js"),
        import(threePath),
      ]);
    const loaded = () =>
      new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
    const initial = loaded(),
      world = new World(document.querySelector("canvas"));
    let track = makeTrack(0),
      race = new Race(track, 0, "trial");
    world.build(track);
    world.setupRacers(race, CRAFT);
    await initial;
    const captures = [],
      seams = [],
      tipContacts = [],
      rayChecks = [],
      cameras = [],
      scenes = [];
    function place(s, branch = 0, speed = 100) {
      const p = race.player,
        f = track.frame(s, branch);
      p.s = p.contactS = s;
      p.branch = branch;
      p.gate = Math.floor((s / track.length) * 32) + 1;
      p.checkpoint = { s, branch, gate: p.gate };
      p.position.copy(f.p);
      p.position.y += 2.2;
      p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      p.pitch = -Math.asin(f.tangent.y);
      p.yawRate = 0;
      p.velocity.copy(f.tangent).multiplyScalar(speed);
      p.speed = speed;
      p.grounded = true;
      p.h = 0;
      p.shield = 100;
    }
    function draw() {
      world.draw(race, 1 / 60);
    }
    function capture(name, s, branch = 0, speed = 140) {
      race = new Race(track, 0, "trial");
      world.setupRacers(race, CRAFT);
      place(s, branch, speed);
      world.setView("chase");
      world.camera.fov = 68 + speed * 0.085;
      draw();
      draw();
      captures.push({
        name,
        data: world.renderer.domElement.toDataURL("image/png").split(",")[1],
      });
      scenes.push({
        name,
        course: track.config.name,
        progress: s / track.length,
        branch,
        drawCalls: world.renderer.info.render.calls,
        triangles: world.renderer.info.render.triangles,
      });
    }
    try {
      for (let index = 0; index < 3; index++) {
        if (index) {
          const ready = loaded();
          track = makeTrack(index);
          world.build(track);
          race = new Race(track, 0, "trial");
          world.setupRacers(race, CRAFT);
          await ready;
        }
        const [start, end] = track.config.split;
        let separation = start * track.length;
        while (
          track.bounds(separation + 0.2, -1).connected ||
          separation < start * track.length + 1
        )
          separation += 0.2;
        capture(
          `course-${index}-environment`,
          track.length * (index === 1 ? 0.34 : 0.045),
          index === 1 ? -1 : 0,
        );
        capture(`course-${index}-billboard`, track.length * 0.035 - 32);
        capture(`course-${index}-fork-nose`, separation - 38);
        if (index === 0)
          for (const distance of [270, 150, 60])
            capture(
              `fork-warning-${distance}m`,
              separation - distance - 35,
              separation - distance - 35 > start * track.length ? -1 : 0,
            );
        for (const phase of [0.2, 0.8])
          for (const branch of [-1, 1]) {
            race = new Race(track, 0, "trial");
            race.countdown = 0;
            world.setupRacers(race, CRAFT);
            const s = (start + (end - start) * phase) * track.length,
              f = track.frame(s, branch),
              p = race.player,
              inward = -branch;
            place(s, branch, 0);
            p.yaw = Math.atan2(f.right.x * inward, f.right.z * inward);
            p.position.addScaledVector(
              f.right,
              inward * (f.width - hullExtent(p, f.right) - 0.3),
            );
            p.velocity.copy(f.right).multiplyScalar(inward * 65);
            world.setView("chase");
            let touched = false,
              lostDeck = false,
              renderMismatch = 0;
            for (let step = 0; step < 20; step++) {
              race.update(1 / 120, {
                throttle: false,
                steer: 0,
                air: 0,
                brake: false,
              });
              touched ||= p.wallTouched;
              lostDeck ||= !p.grounded;
              if (step % 4 === 0) {
                draw();
                renderMismatch = Math.max(
                  renderMismatch,
                  world.ships[0].position.distanceTo(p.position),
                );
              }
            }
            seams.push({
              course: index,
              phase,
              branch,
              touched,
              lostDeck,
              shield: p.shield,
              crossedOldEdge:
                p.position.clone().sub(f.p).dot(f.right) * inward > f.width + 2,
              renderMismatch,
            });
          }
        for (const branch of [-1, 1]) {
          race = new Race(track, 0, "trial");
          race.countdown = 0;
          world.setupRacers(race, CRAFT);
          const s = separation - 3,
            p = race.player;
          place(s, branch, 160);
          p.position.copy(track.frame(s, -1).p).lerp(track.frame(s, 1).p, 0.5);
          p.position.y += 2.2;
          let touched = false;
          for (let step = 0; step < 20; step++) {
            race.update(1 / 120, {
              throttle: false,
              steer: 0,
              air: 0,
              brake: false,
            });
            touched ||= p.wallTouched;
            if (step % 4 === 0) draw();
          }
          tipContacts.push({
            course: index,
            branch,
            touched,
            shield: p.shield,
            grounded: p.grounded,
          });
        }
        world.scene.updateMatrixWorld(true);
        const roads = world.scene.children.filter(
          (object) =>
            object.material?.map === world.textures.road &&
            object.material?.vertexColors,
        );
        const ray = new THREE.Raycaster();
        let checked = 0,
          missed = [];
        for (let i = 1; i < 120; i++) {
          const s = (start + ((end - start) * i) / 120) * track.length;
          const bounds = track.bounds(s, -1);
          if (!bounds.connected) continue;
          for (const offset of [-0.15, 0, 0.15]) {
            const origin = bounds.seam
              .clone()
              .addScaledVector(track.frame(s).right, offset)
              .add(new THREE.Vector3(0, 5, 0));
            ray.set(origin, new THREE.Vector3(0, -1, 0));
            ray.near = 0;
            ray.far = 6;
            checked++;
            if (!ray.intersectObjects(roads, false).length)
              missed.push({ progress: s / track.length, offset });
          }
        }
        rayChecks.push({ course: index, checked, missed });
        if (index === 0) {
          for (const speed of [30, 160, 220]) {
            race = new Race(track, 0, "trial");
            world.setupRacers(race, CRAFT);
            world.setView("chase");
            let s = track.length * 0.045;
            place(s, 0, speed);
            world.camera.fov = 68 + speed * 0.085;
            const distances = [];
            let projectedWidth = 0;
            for (let frame = 0; frame < 30; frame++) {
              place(s, 0, speed);
              draw();
              const focus = race.player.position
                .clone()
                .add(new THREE.Vector3(0, 0.7, 0));
              const offset = world.camera.position.clone().sub(focus);
              distances.push(Math.hypot(offset.x, offset.z));
              s += speed / 60;
            }
            const points = [];
            for (const hull of world.ships[0].children.slice(0, 4)) {
              const vertices = hull.geometry.getAttribute("position");
              for (let i = 0; i < vertices.count; i++)
                points.push(
                  new THREE.Vector3()
                    .fromBufferAttribute(vertices, i)
                    .applyMatrix4(hull.matrixWorld)
                    .project(world.camera),
                );
            }
            projectedWidth =
              ((Math.max(...points.map((p) => p.x)) -
                Math.min(...points.map((p) => p.x))) *
                innerWidth) /
              2;
            cameras.push({
              speed,
              desiredHorizontal: 10.5 + speed * 0.006,
              minHorizontal: Math.min(...distances),
              maxHorizontal: Math.max(...distances),
              projectedHullPixels: projectedWidth,
              fov: world.camera.fov,
            });
          }
        }
      }
      return { seams, tipContacts, rayChecks, cameras, scenes, captures };
    } finally {
      world.renderer.dispose();
    }
  });
  for (const image of result.captures)
    await writeFile(
      `test-artifacts/acceptance-${image.name}.png`,
      Buffer.from(image.data, "base64"),
    );
  delete result.captures;
  for (const item of result.seams) {
    expect(item.touched).toBe(false);
    expect(item.lostDeck).toBe(false);
    expect(item.shield).toBe(100);
    expect(item.crossedOldEdge).toBe(true);
    expect(item.renderMismatch).toBe(0);
  }
  for (const item of result.tipContacts) {
    expect(item.touched).toBe(true);
    expect(item.shield).toBeLessThan(100);
    expect(item.grounded).toBe(true);
  }
  for (const seam of result.rayChecks)
    expect(
      seam.missed,
      `course ${seam.course}: joined deck must have no rendered seam holes`,
    ).toEqual([]);
  for (const camera of result.cameras)
    expect(camera.maxHorizontal).toBeLessThan(camera.desiredHorizontal + 0.25);
  expect(errors).toEqual([]);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await writeFile(
    "test-artifacts/fork-camera-acceptance.json",
    JSON.stringify({ ...result, errors }, null, 2),
  );
  await browser.close();
}
