import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const mobile = process.env.PAD_MOBILE === "1";
const server = process.env.GAME_URL
  ? null
  : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.motorCalls = [];
    window.virtualPad = {
      index: 0,
      id: "Test standard controller",
      mapping: "standard",
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
      vibrationActuator: {
        effects: ["dual-rumble"],
        playEffect(type, effect) {
          window.motorCalls.push({ type, ...effect });
          return Promise.resolve("complete");
        },
        reset() {
          window.motorCalls.push({ type: "reset" });
          return Promise.resolve("complete");
        },
      },
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.virtualPad],
    });
  });
  await page.goto(process.env.GAME_URL || server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  const button = async (index, value) => {
    await page.evaluate(
      ({ index, value }) => {
        Object.assign(window.virtualPad.buttons[index], {
          value,
          pressed: value > 0.5,
          touched: value > 0,
        });
      },
      { index, value },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  };
  for (const stage of ["class", "track", "craft"]) {
    await button(0, 1);
    await page.waitForFunction(
      (stage) => window.nullVector.telemetry.menuStage === stage,
      stage,
    );
    await button(0, 0);
  }
  await button(0, 1);
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(0);
  await button(0, 0);
  await button(6, 0.27);
  await button(7, 0.81);
  await expect
    .poll(async () =>
      page.evaluate(() => window.nullVector.telemetry.controls.airLeft),
    )
    .toBeCloseTo(0.27);
  await expect
    .poll(async () =>
      page.evaluate(() => window.nullVector.telemetry.controls.airRight),
    )
    .toBeCloseTo(0.81);
  expect(
    Number(
      (await page.evaluate(() => window.nullVector.telemetry)).controls
        .throttle,
    ),
  ).toBe(0);
  await button(6, 0);
  await button(7, 0);
  await button(0, 1);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(1);
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.5,
    null,
    { timeout: 20000 },
  );
  // Drive into a real rail: no synthetic race events or production hooks.
  await page.evaluate(() => {
    window.virtualPad.axes[0] = 1;
  });
  await page.waitForFunction(
    () => window.motorCalls.some((call) => call.type === "dual-rumble"),
    null,
    { timeout: 15000 },
  );
  await button(0, 0);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(0);
  await page.evaluate(() => {
    window.virtualPad.axes[0] = 0;
  });
  const pulses = await page.evaluate(() =>
    window.motorCalls.filter((call) => call.type === "dual-rumble"),
  );
  await button(9, 1);
  await page.waitForFunction(() => window.nullVector.telemetry.paused);
  await button(9, 0);
  expect((await page.evaluate(() => window.motorCalls)).at(-1).type).toBe(
    "reset",
  );
  const count = await page.evaluate(() => window.motorCalls.length);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.motorCalls.length)).toBe(count);
  const hints = () =>
    page.locator("#pause-panel [data-gamepad-hint]").evaluateAll((items) =>
      items.map((item) => ({
        id: item.id,
        selected: item.classList.contains("menu-cursor"),
        content: getComputedStyle(item, "::before").content,
        display: getComputedStyle(item, "::before").display,
      })),
    );
  const assertHint = async (content) => {
    const visible = (await hints()).filter((item) => item.display !== "none");
    expect(visible).toHaveLength(1);
    expect(visible[0].selected).toBe(true);
    expect(visible[0].content).toBe(JSON.stringify(content));
  };
  await assertHint("Ⓐ");
  await page.keyboard.press("ArrowDown");
  await assertHint("ENTER");
  await page.keyboard.press("ArrowUp");
  await page
    .locator("#resume")
    .dispatchEvent("pointerdown", { pointerType: "touch" });
  expect(
    (await hints()).filter((item) => item.display !== "none"),
  ).toHaveLength(0);
  // B remains inert in the pause panel, including when held.
  await button(1, 1);
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.nullVector.telemetry)).paused).toBe(
    true,
  );
  await button(1, 0);
  // A on Resume must immediately become held throttle without another press.
  await expect(page.locator("#resume")).toHaveClass(/menu-cursor/);
  // Navigate to Restart, then up + A in one poll: actual activation wins.
  await page.keyboard.press("ArrowDown");
  await assertHint("ENTER");
  await expect(page.locator("#restart")).toHaveClass(/menu-cursor/);
  await page.evaluate(() => {
    for (const index of [0, 12])
      Object.assign(window.virtualPad.buttons[index], {
        value: 1,
        pressed: true,
        touched: true,
      });
  });
  await page.waitForFunction(() => !window.nullVector.telemetry.paused);
  await button(12, 0);
  await expect
    .poll(async () => page.evaluate(() => window.nullVector.telemetry.paused))
    .toBe(false);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(1);
  const resumeTime = await page.evaluate(
    () => window.nullVector.telemetry.time,
  );
  await page.waitForTimeout(250);
  expect(
    (await page.evaluate(() => window.nullVector.telemetry)).time,
  ).toBeGreaterThan(resumeTime);
  expect(
    Number(
      (await page.evaluate(() => window.nullVector.telemetry)).controls
        .throttle,
    ),
  ).toBe(1);
  await button(0, 0);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(0);
  await button(9, 1);
  await page.waitForFunction(() => window.nullVector.telemetry.paused);
  await button(9, 0);
  // Restart is not Resume: holding its activation must not arm launch.
  await page.locator("#restart").dispatchEvent("pointerdown");
  await button(0, 1);
  await page.waitForFunction(
    () =>
      !window.nullVector.telemetry.paused &&
      window.nullVector.telemetry.countdown > 0,
  );
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Number(window.nullVector.telemetry.controls.throttle),
      ),
    )
    .toBe(0);
  await button(0, 0);
  await button(9, 1);
  await page.waitForFunction(() => window.nullVector.telemetry.paused);
  await button(9, 0);
  await page.locator("#quit").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "menu",
  );
  await page.locator("#help-open").click();
  await expect(page.locator("#help-dialog")).toContainText("L2");
  await expect(page.locator("#help-dialog")).toContainText("R2");
  await expect(page.locator("#help-dialog .pad-labels")).toContainText(
    "HOLD: THRUST",
  );
  await expect(page.locator("#help-dialog .pad-labels")).toContainText(
    "Release: coast",
  );
  // Let navigation sample the newly opened dialog with neutral buttons.
  await button(1, 0);
  // B still closes auxiliary dialogs and backs out of setup stages.
  await button(1, 1);
  await expect(page.locator("#help-dialog")).not.toBeVisible();
  await button(1, 0);
  const beforeBack = await page.evaluate(
    () => window.nullVector.telemetry.menuStage,
  );
  expect(beforeBack).toBe("track");
  await button(1, 1);
  await page.waitForFunction(
    () => window.nullVector.telemetry.menuStage === "class",
  );
  await button(1, 0);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      mobile,
      analog: [0.27, 0.81],
      aConsumed: true,
      coast: true,
      gameplayPulses: pulses,
      pauseStops: true,
      pauseBInert: true,
      resumeAHeldThrottle: true,
      menuBBack: true,
      errors,
    }),
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
