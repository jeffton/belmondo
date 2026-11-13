import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.env.QA_OUTPUT || "/var/tmp/belmondo-webgpu-qa";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-angle=swiftshader",
    "--use-vulkan=swiftshader",
  ],
});
const reports = [];
try {
  for (const backend of (process.env.QA_BACKENDS || "webgl,webgpu").split(
    ",",
  )) {
    for (const index of (process.env.QA_TRACKS || "0").split(",").map(Number)) {
      const page = await browser.newPage({
        viewport: { width: 640, height: 400 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.route("**/parity", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<html><style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas id="game"></canvas></html>',
        }),
      );
      await page.goto(new URL("parity", server.resolvedUrls.local[0]).href);
      const result = await page.evaluate(
        async ({ backend, index }) => {
          const { World } = await import("/src/world.js");
          const { makeTrack } = await import("/src/track.js");
          const { Race, CRAFT } = await import("/src/race.js");
          let engine;
          if (backend === "webgpu") {
            const { createWebGPUEngine } =
              await import("/src/webgpu-engine.js");
            engine = await createWebGPUEngine(document.querySelector("canvas"));
          }
          const world = new World(document.querySelector("canvas"), {
            renderer: engine?.worldRenderer,
            createLensflare: engine?.createLensflare,
          });
          const track = makeTrack(index);
          const start = performance.now();
          await world.build(track);
          const buildMs = performance.now() - start;
          const race = new Race(track, 0, "race", 2, world.environment.terrain);
          world.setupRacers(race, CRAFT);
          const first = performance.now();
          world.draw(race, 0, true);
          if (engine)
            await world.renderer.backend.device.queue.onSubmittedWorkDone();
          const firstFrameMs = performance.now() - first;
          const frames = [];
          for (let i = 0; i < 10; i++) {
            const before = performance.now();
            world.draw(race, 0, true);
            if (engine)
              await world.renderer.backend.device.queue.onSubmittedWorkDone();
            else world.renderer.getContext().finish();
            frames.push(performance.now() - before);
          }
          const scene = {
            meshes: 0,
            triangles: 0,
            materials: {},
            flares: 0,
            crowd: 0,
          };
          world.scene.traverse((o) => {
            if (o.isMesh) {
              scene.meshes++;
              const triangles =
                (o.geometry.index?.count ??
                  o.geometry.attributes.position.count) / 3;
              scene.triangles += triangles * (o.isInstancedMesh ? o.count : 1);
              scene.materials[o.material.type] =
                (scene.materials[o.material.type] || 0) + 1;
            }
            if (o.type === "Lensflare" || o.isLensflareMesh) scene.flares++;
            if (o.name === "spectators") scene.crowd += o.count;
          });
          window.parityWorld = world;
          window.parityRace = race;
          return {
            backend,
            index,
            actualWebGPU: !!world.renderer.backend?.isWebGPUBackend,
            buildMs,
            firstFrameMs,
            frames,
            scene,
            resolution: [
              world.renderer.domElement.width,
              world.renderer.domElement.height,
            ],
            adapter: engine?.worldRenderer.backend.device.adapterInfo,
          };
        },
        { backend, index },
      );
      expect(result.actualWebGPU).toBe(backend === "webgpu");
      await page.screenshot({
        path: `${output}/${backend}-${index}-start.png`,
      });
      result.errors = errors;
      reports.push(result);
      await writeFile(
        `${output}/results-${backend}-${index}.json`,
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result));
      expect(errors).toEqual([]);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
  await writeFile(`${output}/results.json`, JSON.stringify(reports, null, 2));
}
