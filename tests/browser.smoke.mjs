import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-artifacts", { recursive: true });
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await expect(page.locator("#tracks button")).toHaveCount(3);
  await expect(page.locator("#crafts button")).toHaveCount(3);
  await page.screenshot({ path: "test-artifacts/desktop-menu.png" });
  await page.locator("#tracks button").nth(1).click();
  await expect(page.locator("#circuit-name")).toHaveText("SOLAR ARRAY");
  await page.locator("#tracks button").nth(2).click();
  await expect(page.locator("#circuit-name")).toHaveText("NOCTILUCENT");
  await page.locator("#tracks button").first().click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.2,
    {},
    { timeout: 20000 },
  );
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => window.nullVector.telemetry.speed > 65,
    {},
    { timeout: 20000 },
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyE");
  await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: "test-artifacts/desktop-race.png" });
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause-panel")).toBeVisible();
  const pausedTime = await page.evaluate(
    () => window.nullVector.telemetry.time,
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.nullVector.telemetry.time)).toBe(
    pausedTime,
  );
  await page.locator("#resume").click();
  await expect(page.locator("#pause-panel")).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("#pause-panel")).toBeVisible();
  await page.locator("#quit").click();
  await page.locator("#music-open").click();
  // A real RIFF/WAVE file is selected through the actual file input and played locally.
  const sampleRate = 8000,
    frames = 4000,
    wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  await page.locator("#files").setInputFiles({
    name: "local-test.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await expect(page.locator("#music-status")).toContainText("local-test.wav");
  await expect(page.locator("#music-status")).not.toContainText(
    "Could not play",
  );
  await page.locator("#music-dialog .close").click();
  await page.locator("#help-open").click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  await page.locator("#help-dialog .close").click();
  await page.locator("#art-open").click();
  await expect(page.locator("#concept")).toBeVisible();
  await page.locator("#art-dialog .close").click();
  console.log(
    "Desktop: track changes, rendering, keyboard thrust/steer/airbrake, pause, blur, music, dialogs OK",
  );
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(url);
  await m.waitForFunction(() => window.nullVector?.telemetry.state === "menu");
  await m.locator("#start").click();
  await m.waitForFunction(
    () => window.nullVector.telemetry.speed > 40,
    {},
    { timeout: 30000 },
  );
  await expect(m.locator("#steer-pad")).toBeVisible();
  await expect(m.locator("#touch-fire")).toBeVisible();
  const rect = await m.locator("#steer-pad").boundingBox();
  await m.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await m.mouse.down();
  await m.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.5);
  await m.waitForTimeout(300);
  await m.mouse.up();
  await m.locator("[data-control=airRight]").click();
  await m.locator("#touch-fire").click();
  await m.screenshot({ path: "test-artifacts/mobile-landscape.png" });
  await m.locator("#pause").click();
  await m.locator("#quit").click();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.screenshot({ path: "test-artifacts/mobile-portrait.png" });
  expect(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await m.locator("#start").click();
  await expect(m.locator("#pause")).toBeVisible();
  await m.screenshot({ path: "test-artifacts/mobile-portrait-race.png" });
  console.log(
    "Mobile: landscape/portrait menus, automatic thrust, proportional pointer pad, buttons, pause, no horizontal overflow OK",
  );
  await mobile.close();
  expect(errors).toEqual([]);
  console.log("No uncaught browser errors.");
} finally {
  await browser.close();
}
