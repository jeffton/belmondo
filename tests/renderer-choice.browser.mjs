import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mockInputApp } from "./helpers/input-app-mocks.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-software-rasterizer"] });
const base = server.resolvedUrls.local[0];
try {
  const unsupported = await browser.newPage();
  await mockInputApp(unsupported);
  await unsupported.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined });
    localStorage.setItem("nv-records", '{"existing-best":42}');
  });
  await unsupported.goto(`${base}?renderer=webgpu`);
  await expect(unsupported.locator("#fatal")).toContainText("WebGPU is unavailable");
  await unsupported.getByRole("button", { name: "USE WEBGL" }).click();
  await expect(unsupported.locator("#renderer-select")).toHaveValue("webgl");
  expect(await unsupported.evaluate(() => localStorage.getItem("nv-records"))).toBe('{"existing-best":42}');
  await unsupported.close();

  const runtime = await browser.newPage();
  await mockInputApp(runtime);
  await runtime.route("**/src/webgpu-engine.js**", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `export async function createWebGPUEngine() {
      const renderer = () => ({
        onDeviceLost() { window.defaultDeviceLost = true; },
        onError() { window.defaultGPUError = true; }
      });
      const engine = { worldRenderer: renderer(), previewRenderer: renderer() };
      window.gpuTestEngine = engine;
      return engine;
    }`,
  }));
  await runtime.route("**/src/main.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.gpuQA = () => ({ state, countdown: race.countdown, renderingFailed, audioPaused: music.audio.paused });` });
  });
  await runtime.goto(`${base}?renderer=webgpu`);
  await expect(runtime.locator("#renderer-select")).toHaveValue("webgpu");
  await runtime.locator("#setup-next").click();
  await runtime.locator("#setup-next").click();
  await runtime.locator("#start").click();
  await expect.poll(() => runtime.evaluate(() => window.gpuQA().state)).toBe("race");
  await runtime.evaluate(() => window.gpuTestEngine.worldRenderer.onDeviceLost({ message: "test device loss" }));
  await expect(runtime.locator("#fatal")).toContainText("test device loss");
  expect(await runtime.evaluate(() => window.defaultDeviceLost)).toBe(true);
  const stopped = await runtime.evaluate(() => window.gpuQA());
  await runtime.keyboard.press("Escape");
  await runtime.evaluate(() => window.dispatchEvent(new Event("blur")));
  await runtime.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await runtime.evaluate(() => window.gpuQA())).toEqual(stopped);
  expect(stopped.audioPaused).toBe(true);
  expect(await runtime.locator("dialog[open]").count()).toBe(0);
  await expect(runtime.getByRole("button", { name: "USE WEBGL" })).toBeVisible();
  await runtime.getByRole("button", { name: "USE WEBGL" }).click();
  await expect(runtime.locator("#renderer-select")).toHaveValue("webgl");
  await runtime.close();
  console.log("Unsupported WebGPU, explicit WebGL recovery, records, device loss, frozen simulation/audio and recovery focus: PASS");
} finally {
  await browser.close();
  await server.close();
}
