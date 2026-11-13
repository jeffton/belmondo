import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { prepareRaceSetup } from "./helpers/setup-menu.mjs";

const url = process.env.GAME_URL || "http://127.0.0.1:5197";
const output = "test-artifacts/instruments";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = [];
try {
  for (const [name, width, height, touch] of [
    ["desktop", 1440, 900, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
    ["compact", 667, 375, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    const insets = touch
      ? height > width
        ? { top: 59, bottom: 34, left: 0, right: 0 }
        : { top: 0, bottom: 21, left: 59, right: 59 }
      : { top: 0, bottom: 0, left: 0, right: 0 };
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    const manifest = await cdp.send("Page.getAppManifest");
    expect(manifest.errors).toEqual([]);
    expect(JSON.parse(manifest.data).short_name).toBe("BELMONDO");
    expect(
      (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
    ).toEqual([]);
    await prepareRaceSetup(page);
    await page.locator("#start").click();
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#hud-track")).toBeHidden();
    await expect(page.locator("#launch-status")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("BRAKE → RELEASE");
    if (touch)
      await page.screenshot({ path: `${output}/${name}-countdown.png` });
    await expect(page.locator("body")).not.toContainText("65–80%");
    await page.waitForFunction(
      () => window.nullVector.telemetry.time > 0.2,
      {},
      { timeout: 30000 },
    );
    if (!touch) await page.keyboard.down("ArrowUp");
    await page.waitForFunction(
      () => window.nullVector.telemetry.speed > 15,
      {},
      { timeout: 30000 },
    );
    await page.screenshot({ path: `${output}/${name}-race.png` });
    // Pause the actual race, then examine its rendered instrument geometry.
    if (touch) await page.locator("#pause").tap();
    else await page.keyboard.press("Escape");
    const boxes = await page.evaluate(() => {
      const selectors = [
        ".shield-instrument",
        ".velocity",
        "#shield-num",
        "#speed",
        ".thrust-meter",
        ".speed-instrument",
        "#weapon",
        "#steer-pad",
        ".touch-actions",
        "#touch-fire",
        "#air-pad",
        "#view",
        "#pause",
      ];
      return Object.fromEntries(
        selectors.map((selector) => {
          const el = document.querySelector(selector);
          const r = el.getBoundingClientRect();
          return [
            selector,
            {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
              visible: Boolean(el.getClientRects().length),
            },
          ];
        }),
      );
    });
    for (const selector of [".shield-instrument", ".velocity"]) {
      const b = boxes[selector];
      expect(b.x, `${name} ${selector} left`).toBeGreaterThanOrEqual(
        insets.left,
      );
      expect(b.y).toBeGreaterThanOrEqual(insets.top);
      expect(b.right).toBeLessThanOrEqual(width - insets.right);
      expect(b.bottom).toBeLessThanOrEqual(height - insets.bottom);
      for (const control of [
        "#weapon",
        "#steer-pad",
        ".touch-actions",
        "#touch-fire",
        "#air-pad",
        "#view",
        "#pause",
      ]) {
        const c = boxes[control];
        if (!c.visible) continue;
        expect(
          Math.min(b.right, c.right) > Math.max(b.x, c.x) &&
            Math.min(b.bottom, c.bottom) > Math.max(b.y, c.y),
          `${name}: ${selector} overlaps ${control}`,
        ).toBe(false);
      }
    }
    const shield = boxes[".shield-instrument"];
    const velocity = boxes[".velocity"];
    expect(
      Math.min(shield.right, velocity.right) > Math.max(shield.x, velocity.x) &&
        Math.min(shield.bottom, velocity.bottom) >
          Math.max(shield.y, velocity.y),
      `${name}: shield overlaps velocity`,
    ).toBe(false);
    expect(boxes[".thrust-meter"].width).toBeGreaterThan(40);
    expect(boxes[".speed-instrument"].width).toBeGreaterThan(40);
    // Presentation-only critical state: exercise styling without changing simulation.
    await page.evaluate(() => {
      document.querySelector("#pause-panel").hidden = true;
      document.querySelector(".shield").classList.add("critical");
      document.querySelector("#shield-num").textContent = "18";
      document.querySelector("#shield-bar").style.width = "18%";
      document.querySelector("#shield-bar").style.background = "#ff642a";
      document.querySelector("#shield-warning").hidden = false;
    });
    await expect(page.locator("#shield-warning")).toBeVisible();
    const warning = await page.locator("#shield-warning").boundingBox();
    expect(warning.x).toBeGreaterThanOrEqual(shield.x);
    expect(warning.x + warning.width).toBeLessThanOrEqual(shield.right);
    expect(warning.y).toBeGreaterThanOrEqual(shield.y);
    expect(warning.y + warning.height).toBeLessThanOrEqual(shield.bottom);
    const value = await page.locator(".shield-value").boundingBox();
    expect(warning.x + warning.width).toBeLessThanOrEqual(value.x);
    await page.screenshot({ path: `${output}/${name}-critical.png` });
    expect(errors).toEqual([]);
    report.push({ name, insets, boxes, errors });
    await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  "Actual race instruments pass desktop, portrait, landscape and compact viewport checks; critical styling captured.",
);
