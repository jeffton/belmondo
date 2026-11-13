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
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await expect(page.locator("#tracks")).toBeHidden();
  await expect(page.locator("#crafts")).toBeHidden();
  await expect(page.locator("#start")).toBeHidden();
  await page.screenshot({ path: "test-artifacts/desktop-menu.png" });
  await page.locator('#speed-class input[value="1"]').check();
  await page.locator("#quality").check();
  await page.locator("#setup-next").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await expect(page.locator("#tracks button")).toHaveCount(7);
  await page.locator("#tracks button").nth(1).click();
  await expect(page.locator("#circuit-name")).toHaveText("SOLAR ARRAY");
  await page.locator("#tracks button").nth(2).click();
  await expect(page.locator("#circuit-name")).toHaveText("NOCTILUCENT");
  await page.locator("#tracks button").first().click();
  await page.locator("#setup-next").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
  await expect(page.locator("#crafts button")).toHaveCount(3);
  await expect(page.locator("#start")).toBeVisible();
  await page.locator('#crafts button[data-craft-index="1"]').click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.2,
    {},
    { timeout: 20000 },
  );
  await expect(page.locator("#view")).toBeHidden();
  await expect(page.locator("#pause")).toBeHidden();
  await page.keyboard.press("KeyV");
  await expect(page.locator("#view")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("KeyV");
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => window.nullVector.telemetry.speed > 65,
    {},
    { timeout: 20000 },
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("KeyL");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyL");
  await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: "test-artifacts/desktop-race.png" });
  await page.keyboard.press("KeyP");
  await expect(page.locator("#pause-panel")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect(page.locator("#pause-panel .help-small")).toHaveCount(0);
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
  await expect(m.locator("#menu")).toHaveAttribute("data-stage", "class");
  await expect(m.locator("#tracks")).toBeHidden();
  await expect(m.locator("#crafts")).toBeHidden();
  await expect(m.locator("#start")).toBeHidden();
  await m.locator('#speed-class input[value="2"]').check();
  await m.locator("#quality").check();
  await m.locator("#setup-next").tap();
  await expect(m.locator("#menu")).toHaveAttribute("data-stage", "track");
  await expect(m.locator("#tracks button")).toHaveCount(7);
  await m.locator("#tracks button").first().tap();
  await m.locator("#setup-next").tap();
  await expect(m.locator("#menu")).toHaveAttribute("data-stage", "craft");
  await expect(m.locator("#crafts button")).toHaveCount(3);
  await expect(m.locator("#start")).toBeVisible();
  await m.locator('#crafts button[data-craft-index="0"]').tap();
  await m.locator("#start").tap();
  await m.waitForFunction(() => window.nullVector.telemetry.state === "race");
  const cdp = await mobile.newCDPSession(m);
  const airPad = await m.locator("#air-pad").boundingBox();
  const airRadius = airPad.width * 0.375;
  const coastFinger = {
    id: 1,
    x: airPad.x + airPad.width / 2,
    y: airPad.y + 16 + airRadius,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [coastFinger],
  });
  await m.waitForFunction(
    () => window.nullVector.telemetry.controls.throttle === 0,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await m.waitForFunction(
    () => window.nullVector.telemetry.speed > 40,
    {},
    { timeout: 30000 },
  );
  await expect(m.locator("#steer-pad")).toBeVisible();
  await expect(m.locator("#touch-fire")).toBeVisible();
  const rect = await m.locator("#steer-pad").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 2, x: rect.x + rect.width * 0.8, y: rect.y + rect.height * 0.5 },
    ],
  });
  await m.waitForTimeout(300);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await m.waitForFunction(() => window.nullVector.telemetry.controls.throttle);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        id: 3,
        x: airPad.x + airPad.width / 2 + airRadius,
        y: airPad.y + 16,
      },
    ],
  });
  await m.waitForFunction(
    () => window.nullVector.telemetry.controls.airRight === 1,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  if (await m.locator("#touch-fire").isEnabled())
    await m.locator("#touch-fire").click();
  else await expect(m.locator("#touch-fire")).toBeDisabled();
  await m.screenshot({ path: "test-artifacts/mobile-landscape.png" });
  await m.locator("#pause").tap();
  await expect(m.locator("#pause-panel")).toBeVisible();
  await expect(m.locator("#pause-panel .help-small")).toHaveCount(0);
  await m.locator("#resume").click();
  await expect(m.locator("#pause-panel")).toBeHidden();
  await m.locator("#pause").tap();
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
    "Mobile: landscape/portrait menus, automatic thrust, halfstick coast/airbrake, proportional steering, fire, pause, no horizontal overflow OK",
  );
  await mobile.close();
  expect(errors).toEqual([]);
  console.log("No uncaught browser errors.");
} finally {
  await browser.close();
}
