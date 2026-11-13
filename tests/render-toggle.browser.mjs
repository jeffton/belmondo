import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [],
  results = [];
await mkdir("test-artifacts", { recursive: true });
try {
  for (const mobile of [false, true]) {
    const viewport = mobile
      ? { width: 844, height: 390 }
      : { width: 1280, height: 800 };
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = async () => {
      await page.waitForFunction(
        () => window.nullVector?.telemetry.state === "menu",
      );
    };
    const rendered = async (lowRes) => {
      const scale = lowRes ? 0.55 : Math.min(1, 1500 / viewport.width);
      const expected = {
        mode: lowRes ? "retro" : "clean",
        width: Math.round(viewport.width * scale),
        height: Math.round(viewport.height * scale),
      };
      await page.waitForFunction((wanted) => {
        const canvas = document.querySelector("#game");
        return (
          window.nullVector.telemetry.render === wanted.mode &&
          canvas.width === wanted.width &&
          canvas.height === wanted.height
        );
      }, expected);
      results.push({ mobile, ...expected });
    };
    await page.goto(url);
    await ready();
    const toggle = page.locator('#render-quality input[value="retro"]');
    await expect(toggle).toBeChecked();
    await expect(page.locator("select#quality")).toHaveCount(0);
    await rendered(true);
    await page.locator("#quality-clean").check();
    await expect(toggle).not.toBeChecked();
    await rendered(false);
    if (mobile) await toggle.tap();
    else {
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toBeFocused();
    }
    await expect(toggle).toBeChecked();
    await rendered(true);
    expect(await page.evaluate(() => localStorage.getItem("nv-render"))).toBe(
      "retro",
    );
    await page.reload();
    await ready();
    await expect(toggle).toBeChecked();
    await rendered(true);
    await page.locator("#tracks button").nth(1).click();
    await expect(toggle).toBeChecked();
    await rendered(true);
    await page.screenshot({
      path: `test-artifacts/render-toggle-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.locator("#start").click();
    await page.waitForFunction(() => window.nullVector.telemetry.time > 0.1);
    await rendered(true);
    if (mobile) await page.locator("#pause").tap();
    else await page.keyboard.press("Escape");
    const pauseDialog = page.getByRole("dialog", {
      name: "PAUSED",
      exact: true,
    });
    await expect(pauseDialog).toBeVisible();
    await expect(page.locator("#resume")).toBeFocused();
    expect(
      await pauseDialog.evaluate((dialog) => dialog.matches(":modal")),
    ).toBe(true);
    // Native dialogs permit browser-chrome focus between the first/last item.
    // The page must never focus a background control during that traversal.
    for (const key of ["Shift+Tab", "Shift+Tab", "Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect(
        await pauseDialog.evaluate(
          (dialog) =>
            !document.hasFocus() || dialog.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await page.locator("#pause").evaluate((button) => button.focus());
    await expect(page.locator("#pause")).not.toBeFocused();
    await expect(page.locator("#resume")).toBeFocused();
    await page.locator("#pause-music").click();
    await expect(page.locator("#music-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#music-dialog")).not.toBeVisible();
    await expect(pauseDialog).toBeVisible();
    await expect(page.locator("#pause-music")).toBeFocused();
    expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(pauseDialog).not.toBeVisible();
    await expect(page.locator("#resume")).not.toBeFocused();
    expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
      false,
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#resume")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(pauseDialog).not.toBeVisible();
    expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
      false,
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#resume")).toBeFocused();
    await page.locator("#restart").click();
    await expect(pauseDialog).not.toBeVisible();
    expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
      false,
    );
    await page.keyboard.press("Escape");
    await expect(pauseDialog).toBeVisible();
    await page.locator("#quit").click();
    await expect(pauseDialog).not.toBeVisible();
    await expect(page.locator("#start")).toBeFocused();
    await ready();
    if (mobile) await page.locator("#quality-clean").tap();
    else await page.locator("#quality-clean").check();
    await expect(toggle).not.toBeChecked();
    await rendered(false);
    expect(await page.evaluate(() => localStorage.getItem("nv-render"))).toBe(
      "clean",
    );
    await page.reload();
    await ready();
    await expect(toggle).not.toBeChecked();
    await rendered(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "Render switch: keyboard/touch, actual clean/55% canvas sizes, reload persistence, course changes and race/menu lifecycle pass on desktop/mobile.",
  );
} finally {
  await writeFile(
    "test-artifacts/render-toggle-report.json",
    JSON.stringify({ url, results, errors }, null, 2),
  );
  await browser.close();
}
