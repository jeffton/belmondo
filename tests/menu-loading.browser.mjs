import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { mkdir } from "node:fs/promises";

const viewport = JSON.parse(process.env.MENU_VIEWPORT || "[390,844]");
const output = "/var/tmp/belmondo-immediate-models";
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await page.waitForFunction(() => !window.nullVector.telemetry.trackLoading);
  // Hold subsequent real worker scripts. The renderer and model continue running.
  await page.route("**/assets/course-preparation.worker-*.js", () => {});
  const checkImmediateModel = async (name, filename) => {
    await expect(page.locator("#model-name")).toHaveText(name);
    await expect(page.locator("#menu-model")).toHaveCSS("opacity", "1");
    await expect(page.locator("#game")).toHaveCSS("opacity", "0");
    expect(
      await page.evaluate(() => window.nullVector.telemetry.loadedTrack),
    ).toBe(0);
    await expect(page.locator("body")).toHaveClass(/course-loading/);
    await page.screenshot({
      path: `${output}/${viewport.join("x")}-${filename}.png`,
    });
  };
  await page.keyboard.press("ArrowRight");
  await checkImmediateModel("MONSOON", "keyboard");
  await page.locator('#tracks button[data-index="2"]').tap();
  await checkImmediateModel("KAISEKI COAST", "touch");
  const sameRow = await page
    .locator("#tracks button")
    .evaluateAll(
      (buttons) =>
        Math.abs(
          buttons[0].getBoundingClientRect().top -
            buttons[2].getBoundingClientRect().top,
        ) < 2,
    );
  await page.evaluate((horizontal) => {
    window.modelPad = {
      axes: horizontal ? [-1, 0] : [0, -1],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [window.modelPad],
    });
  }, sameRow);
  await checkImmediateModel("WHITEOUT", "gamepad");
  expect(errors).toEqual([]);
  console.log(
    `Immediate models/labels with held real worker PASS ${viewport.join("×")}`,
  );
} finally {
  await browser.close();
  await server.close();
}
