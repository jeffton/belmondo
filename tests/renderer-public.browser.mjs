import { chromium, expect } from "@playwright/test";

const url = process.env.GAME_URL;
if (!url) throw new Error("Set GAME_URL to the built game URL.");
const viewport =
  process.env.QA_VIEWPORT === "mobile"
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 };
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-angle=swiftshader",
    "--use-vulkan=swiftshader",
  ],
});
try {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    if (!localStorage.getItem("nv-records"))
      localStorage.setItem("nv-records", '{"renderer-smoke-record":42}');
  });
  const page = await context.newPage();
  const errors = [];
  let gpuRequests = 0;
  let phase = "webgl";
  page.on("pageerror", (error) =>
    errors.push({ phase, message: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push({ phase, message: message.text() });
  });
  page.on("request", (request) => {
    if (request.url().includes("webgpu-engine")) gpuRequests++;
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.nullVector?.telemetry.backend === "webgl",
    null,
    { timeout: 45000 },
  );
  await expect(page.locator("#renderer-select")).toHaveValue("webgl");
  expect(gpuRequests).toBe(0);
  await page.locator("#setup-next").click();
  await page.locator("#setup-next").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.nullVector.telemetry.previewResources.renderCalls,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await page.locator("#start").click();
  await expect
    .poll(() => page.evaluate(() => window.nullVector.telemetry.state))
    .toBe("race");
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.locator("#quit").click();
  await page.locator("#setup-back").click();
  await page.locator("#setup-back").click();
  expect(errors).toEqual([]);
  const record = await page.evaluate(() => localStorage.getItem("nv-records"));

  phase = "webgpu";
  await page.locator("#renderer-select").selectOption("webgpu");
  // SwiftShader's raw WebGPU clear is known to fail on this server. This
  // verifies the actual production error/recovery path, not rendering parity.
  await expect(page.locator("#fatal")).toBeVisible({ timeout: 45000 });
  await expect(page.locator("#fatal")).toContainText("WebGPU");
  await expect(page.getByRole("button", { name: "USE WEBGL" })).toBeVisible();
  expect(gpuRequests).toBeGreaterThan(0);
  const gpuFailure = await page.locator("#fatal").textContent();
  phase = "recovery";
  await page.getByRole("button", { name: "USE WEBGL" }).click();
  await page.waitForFunction(
    () => window.nullVector?.telemetry.backend === "webgl",
    null,
    { timeout: 45000 },
  );
  await expect(page.locator("#renderer-select")).toHaveValue("webgl");
  expect(await page.evaluate(() => localStorage.getItem("nv-records"))).toBe(
    record,
  );
  expect(await page.evaluate(() => localStorage.getItem("nv-renderer"))).toBe(
    "webgl",
  );
  console.log(
    JSON.stringify({
      viewport,
      defaultWebGL: true,
      lazyGPU: true,
      nativePreviewAndRace: true,
      explicitOptIn: true,
      manualRecovery: true,
      recordsPreserved: true,
      gpuFailure,
      gpuErrors: errors.filter((error) => error.phase === "webgpu"),
    }),
  );
  await context.close();
} finally {
  await browser.close();
}
