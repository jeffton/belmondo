import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const output =
  process.env.MENU_ARTIFACTS || "/var/tmp/belmondo-menu-acceptance";
await mkdir(output, { recursive: true });
const errors = [];
const results = [];
try {
  for (const [index, viewport] of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ].entries()) {
    const context = await browser.newContext({
      viewport,
      isMobile: index > 0,
      hasTouch: index > 0,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = () =>
      page.waitForFunction(() => window.nullVector?.telemetry.state === "menu");
    const render = async (quality) => {
      await page.waitForFunction(
        (wanted) => window.nullVector.telemetry.render === wanted,
        quality,
      );
      const dimensions = await page
        .locator("#game")
        .evaluate((canvas) => [canvas.width, canvas.height]);
      const scale =
        quality === "retro" ? 0.55 : Math.min(1, 1500 / viewport.width);
      expect(dimensions).toEqual([
        Math.round(viewport.width * scale),
        Math.round(viewport.height * scale),
      ]);
    };
    await page.goto(server.resolvedUrls.local[0]);
    await ready();
    await expect(page.locator("#quality")).toBeChecked();
    await render("retro");
    await page.locator("#quality").click();
    await render("retro");
    await page.locator("#quality-clean").check();
    await render("clean");
    await page.reload();
    await ready();
    await expect(page.locator("#quality-clean")).toBeChecked();
    await render("clean");
    await page.locator("#quality").check();
    await page.reload();
    await ready();
    await render("retro");
    const selected = page.locator('input[name="speed-class"]:checked');
    await selected.focus();
    for (let n = 0; n < index; n++) await page.keyboard.press("ArrowRight");
    await expect(
      page.locator(`input[name="speed-class"][value="${index}"]`),
    ).toBeChecked();
    const mode = index === 1 ? "race" : "trial";
    await page.locator(`input[name="mode"][value="${mode}"]`).check();
    await page.locator(`input[name="mode"][value="${mode}"]`).click();
    await page.screenshot({
      path: `${output}/menu-${index}.png`,
      fullPage: true,
    });
    await page.locator("#help-open").click();
    await expect(
      page.getByRole("heading", { name: "KEYBOARD", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "GAMEPAD", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${output}/briefing-${index}.png` });
    if (index > 0) {
      await page.locator("#help-dialog").evaluate((dialog) => {
        const section = dialog.querySelectorAll(".control-card")[1];
        dialog.scrollTop +=
          section.getBoundingClientRect().top -
          dialog.getBoundingClientRect().top -
          24;
      });
      await page.screenshot({
        path: `${output}/briefing-gamepad-${index}.png`,
      });
      await page
        .getByText("Change view", { exact: true })
        .last()
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/briefing-controls-${index}.png`,
      });
    }
    await page.keyboard.press("Escape");
    await goToSetupStage(page, "craft");
    await page.locator("#start").click();
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    await page.waitForFunction(() => window.nullVector.telemetry.speed > 5);
    const telemetry = await page.evaluate(() => window.nullVector.telemetry);
    expect(telemetry.speedClass).toBe(index);
    expect(telemetry.classId).toBe(`c${index + 1}`);
    await expect(page.locator("#position")).toContainText(
      mode === "race" ? "/8" : "/1",
    );
    await page.keyboard.up("KeyW");
    await page.keyboard.press("Escape");
    await page.locator("#quit").click();
    await expect(
      page.locator(`input[name="speed-class"][value="${index}"]`),
    ).toBeChecked();
    await expect(
      page.locator(`input[name="mode"][value="${mode}"]`),
    ).toBeChecked();
    results.push({
      viewport,
      speedClass: index,
      classId: telemetry.classId,
      mode,
      speed: telemetry.speed,
      render: telemetry.render,
    });
    console.log("PASS", results.at(-1));
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
