import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5195";
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
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [844, 390],
    [320, 568],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    await page.locator("#help-open").click();
    const help = page.locator("#help-dialog");
    await expect(help).toBeVisible();
    await expect(help.locator("table, dl")).toHaveCount(0);
    await expect(help).not.toContainText("LAUNCH");
    await expect(help).not.toContainText("launch boost");
    await expect(help).not.toContainText("BRAKE → RELEASE");
    await expect(
      help.locator("kbd").filter({ hasText: /^[QEP↑←↓→]$/ }),
    ).toHaveCount(0);
    for (const keys of [
      ["W", "A", "S", "D"],
      ["I", "J", "K", "L"],
    ]) {
      const boxes = await Promise.all(
        keys.map((key) =>
          help
            .locator("kbd")
            .filter({ hasText: new RegExp(`^${key}$`) })
            .boundingBox(),
        ),
      );
      const [top, left, bottom, right] = boxes;
      expect(top.y).toBeLessThan(bottom.y);
      expect(top.x).toBeCloseTo(bottom.x, 0);
      expect(left.x).toBeLessThan(bottom.x);
      expect(right.x).toBeGreaterThan(bottom.x);
      expect(left.y).toBeCloseTo(right.y, 0);
    }
    const overflow = await help.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflow, `${width}px briefing horizontal overflow`).toBe(false);
    for (const heading of ["keyboard-heading", "gamepad-heading"]) {
      const card = help.locator(`section[aria-labelledby="${heading}"]`);
      await card.screenshot({
        path: `test-artifacts/controls-${heading}-${width}.png`,
      });
    }
    // All SVG labels must fit the diagram, including long airbrake callouts.
    expect(
      await help.locator(".controller-map").evaluate((svg) =>
        [...svg.querySelectorAll("text")].every((text) => {
          const box = text.getBBox();
          return (
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= 440 &&
            box.y + box.height <= 410
          );
        }),
      ),
    ).toBe(true);
    await page.locator("#help-dialog .close").click();
    await expect(help).not.toBeVisible();
    await page.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "Controls guide: physical key formations, no Q/E/P, arrow keys or tables, responsive diagrams and close PASS.",
  );
} finally {
  await browser.close();
}
