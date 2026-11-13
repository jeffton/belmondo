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
        console.log(message.type(), message.text());
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
            console.log("GPU probe: initializing engine");
            engine = await createWebGPUEngine(document.querySelector("canvas"));
            console.log("GPU probe: engine initialized");
          }
          const world = new World(document.querySelector("canvas"), {
            renderer: engine?.worldRenderer,
            createLensflare: engine?.createLensflare,
          });
          const track = makeTrack(index);
          const start = performance.now();
          console.log("GPU probe: building world");
          await world.build(track);
          console.log("GPU probe: world built");
          const buildMs = performance.now() - start;
          const race = new Race(track, 0, "race", 2, world.environment.terrain);
          world.setupRacers(race, CRAFT);
          const first = performance.now();
          console.log("GPU probe: first render");
          world.draw(race, 0, true);
          console.log("GPU probe: first render submitted");
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
      if (index === 0) {
        await page.evaluate(async () => {
          const world = window.parityWorld;
          const celestial = world.scene.getObjectByName("low-sun");
          world.camera.lookAt(celestial.position);
          world.renderer.render(world.scene, world.camera);
          if (world.renderer.backend?.isWebGPUBackend)
            await world.renderer.backend.device.queue.onSubmittedWorkDone();
          else world.renderer.getContext().finish();
        });
        await page.screenshot({
          path: `${output}/${backend}-${index}-flare.png`,
        });
        await page.evaluate(async () => {
          const { THREE } = await import("/tests/helpers/webgpu-scenes.js");
          const world = window.parityWorld;
          const source = world.scene.getObjectByName("spectators");
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x203040);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x808080, 2));
          const crowd = new THREE.InstancedMesh(
            source.geometry,
            source.material,
            2,
          );
          const transform = new THREE.Object3D();
          transform.position.set(-6, 1, 0);
          transform.rotation.set(0, 0.2, 0.05);
          transform.scale.setScalar(1.1);
          transform.updateMatrix();
          crowd.setMatrixAt(0, transform.matrix);
          transform.position.set(6, -1, 1);
          transform.rotation.set(0, -0.65, -0.15);
          transform.scale.setScalar(0.85);
          transform.updateMatrix();
          crowd.setMatrixAt(1, transform.matrix);
          crowd.setColorAt(0, new THREE.Color(0xffffff));
          crowd.setColorAt(1, new THREE.Color(0xc6a17d));
          const parent = new THREE.Group();
          parent.rotation.z = 0.12;
          parent.position.y = 0.4;
          parent.add(crowd);
          scene.add(parent);
          const camera = new THREE.OrthographicCamera(-12, 12, 8, -7, 0.1, 100);
          camera.position.set(0, 0, 20);
          world.finishDistrict.update(1.25);
          window.crowdQA = { scene, camera, parent, crowd };
          world.renderer.render(scene, camera);
          if (world.renderer.backend?.isWebGPUBackend)
            await world.renderer.backend.device.queue.onSubmittedWorkDone();
          else world.renderer.getContext().finish();
        });
        await page.screenshot({
          path: `${output}/${backend}-${index}-crowd.png`,
        });
        await page.evaluate(async () => {
          const { THREE } = await import("/tests/helpers/webgpu-scenes.js");
          const world = window.parityWorld;
          const { scene, camera, parent, crowd } = window.crowdQA;
          parent.remove(crowd);
          for (let id = 0; id < 2; id++) {
            const geometry = crowd.geometry.clone();
            const vertices = geometry.getAttribute("position");
            const wave = Math.sin(1.25 * 2.7 + id * 2.399);
            for (let i = 0; i < vertices.count; i++) {
              const height = Math.max(0, vertices.getY(i) - 0.35);
              vertices.setXY(
                i,
                vertices.getX(i) + wave * 0.12 * height,
                vertices.getY(i) + wave * 0.045 * height,
              );
            }
            const material = crowd.material.clone();
            material.onBeforeCompile = () => {};
            material.customProgramCacheKey = () => "cpu-crowd-reference";
            delete material.userData.finishCrowdTime;
            material.color.set(id === 0 ? 0xffffff : 0xc6a17d);
            const reference = new THREE.Mesh(geometry, material);
            crowd.getMatrixAt(id, reference.matrix);
            reference.matrixAutoUpdate = false;
            parent.add(reference);
          }
          world.renderer.render(scene, camera);
          if (world.renderer.backend?.isWebGPUBackend)
            await world.renderer.backend.device.queue.onSubmittedWorkDone();
          else world.renderer.getContext().finish();
        });
        await page.screenshot({
          path: `${output}/${backend}-${index}-crowd-reference.png`,
        });
      }
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
