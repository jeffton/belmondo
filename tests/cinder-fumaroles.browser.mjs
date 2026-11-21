import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";

const output = process.env.FUMAROLE_CAPTURES;
if (output) await mkdir(output, { recursive: true });
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
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/__volcano_fixture__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
    }),
  );
  await page.goto(server.resolvedUrls.local[0] + "__volcano_fixture__.html");
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world.ts")).text();
    const [THREE, { World }, { Race, CRAFT }, { makeTrack, TRACK_INDEX }] =
      await Promise.all([
        import(source.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)[1]),
        import("/src/world.ts"),
        import("/src/race.ts"),
        import("/src/track.ts"),
      ]);
    const track = makeTrack(TRACK_INDEX.CINDERLINE);
    const world = new World(document.querySelector("canvas"));
    const loaded = new Promise((resolve, reject) => {
      THREE.DefaultLoadingManager.onLoad = resolve;
      THREE.DefaultLoadingManager.onError = reject;
    });
    world.build(track);
    const race = new Race(track, 1, "trial", 0, world.environment.terrain);
    race.countdown = 0;
    world.setupRacers(race, CRAFT);
    await loaded;
    const smoke = world.scene.getObjectByName("cinder-volcano-fumaroles");
    window.renderVent = (quality, u, demo) => {
      const branch = demo ? -1 : 0;
      const station = u * track.length;
      const f = track.frame(station, branch);
      const p = race.player;
      p.s = p.contactS = station;
      p.branch = branch;
      p.position.copy(f.p).addScaledVector(f.up, 2.2);
      p.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      p.velocity.copy(f.tangent).multiplyScalar(120);
      if (world.quality !== quality) {
        world.quality = quality;
        world.resize();
      }
      world.cameraReady = false;
      world.cameraForward = null;
      world.time = 1;
      world.draw(race, 1 / 60, demo);
      const time = smoke.material.uniforms.time.value;
      const rendered = { ...world.renderer.info.render };
      window.drawVentAt = (dt) => {
        smoke.visible = dt !== null;
        smoke.material.uniforms.time.value = time + (dt ?? 0);
        world.renderer.render(world.scene, world.camera);
      };
      window.drawVentAt(null);
      const hidden = { ...world.renderer.info.render };
      return {
        time,
        calls: rendered.calls - hidden.calls,
        triangles: rendered.triangles - hidden.triangles,
        canvas: world.renderer.domElement.width,
      };
    };
    window.disposeVent = () => {
      let geometry = 0,
        material = 0;
      smoke.geometry.addEventListener("dispose", () => geometry++);
      smoke.material.addEventListener("dispose", () => material++);
      world.disposeScene();
      return { geometry, material };
    };
  });
  // Sky-only crops above the vent(s), clear of the road, ships and other actors.
  const views = [
    {
      u: 0.102,
      name: "ash-crown",
      clip: { x: 405, y: 69, width: 90, height: 99 },
    },
    {
      u: 0.522,
      name: "caldera-furnace",
      clip: { x: 155, y: 0, width: 135, height: 100 },
    },
    {
      u: 0.708,
      name: "sulfur-sisters",
      clip: { x: 310, y: 36, width: 90, height: 110 },
    },
  ];
  for (const quality of ["retro", "high"]) {
    for (const { u, name, clip } of views) {
      for (const demo of [false, true]) {
        const key = `${quality}-${name}-${demo ? "flyover" : "chase"}`;
        const metrics = await page.evaluate(
          (args) => window.renderVent(...args),
          [quality, u, demo],
        );
        expect(metrics, key).toEqual({
          time: 1 + 1 / 60,
          calls: 1,
          triangles: 6,
          canvas: quality === "retro" ? 550 : 1000,
        });
        const clean = await page.screenshot({ clip });
        const evidence = [];
        const phases = output
          ? Array.from({ length: 9 }, (_, i) => i / 4)
          : [0, 1, 2];
        for (const [i, dt] of phases.entries()) {
          await page.evaluate((phase) => window.drawVentAt(phase), dt);
          if (output)
            await page.screenshot({
              path: `${output}/${key}-${String(i).padStart(2, "0")}.png`,
            });
          if (Number.isInteger(dt))
            evidence.push(await page.screenshot({ clip }));
        }
        expect(
          evidence.every((image) => !image.equals(clean)),
          key + " visible in the real camera",
        ).toBe(true);
        expect(
          new Set(evidence.map((image) => image.toString("base64"))).size,
          key + " motion",
        ).toBe(3);
        console.log(key, "visible and animated, 1 draw / 6 triangles");
      }
    }
  }
  expect(await page.evaluate(() => window.disposeVent())).toEqual({
    geometry: 1,
    material: 1,
  });
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await server.close();
}
