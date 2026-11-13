import { chromium } from "@playwright/test";
import { createServer } from "vite";

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
try {
  const page = await browser.newPage();
  page.on("console", (message) => console.log(message.type(), message.text()));
  await page.route("**/probe", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto(new URL("probe", server.resolvedUrls.local[0]).href);
  const results = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const result = {
      api: !!navigator.gpu,
      adapter: !!adapter,
      info: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            description: adapter.info.description,
          }
        : null,
    };
    // A raw clear isolates browser/adapter failures from Three and game code.
    try {
      const device = await adapter.requestDevice();
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      canvas.width = canvas.height = 64;
      const context = canvas.getContext("webgpu");
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 1, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      result.rawClear = { passed: true };
      context.unconfigure();
      device.destroy();
    } catch (error) {
      result.rawClear = { passed: false, error: error.message };
    }
    try {
      const { THREE } = await import("/tests/helpers/webgpu-scenes.js");
      const { createWebGPUEngine } = await import("/src/webgpu-engine.js");
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const engine = await createWebGPUEngine(canvas);
      const scene = new THREE.Scene();
      scene.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        ),
      );
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.z = 4;
      engine.worldRenderer.setSize(64, 64);
      engine.worldRenderer.render(scene, camera);
      await engine.worldRenderer.backend.device.queue.onSubmittedWorkDone();
      result.cube = { passed: true };
      await engine.previewRenderer.dispose();
      await engine.worldRenderer.dispose();
    } catch (error) {
      result.cube = { passed: false, error: error.message };
    }
    return result;
  });
  console.log(JSON.stringify(results, null, 2));
  if (!results.rawClear.passed || !results.cube.passed) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
