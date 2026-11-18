import { chromium, expect } from "@playwright/test";
import { TRACKS } from "../src/track.ts";
import { SPEED_CLASSES } from "../src/speed-classes.ts";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const viewport = JSON.parse(
  process.env.VIEWPORT || '{"width":1440,"height":900}',
);
const mobile = viewport.width < 900;
const placements = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 3, 2, 1, null, 4, 5],
  [null, 1, 3, 2, 8, 6, 4],
];
const progression = { version: 1, classes: {} };
for (const [index, spec] of SPEED_CLASSES.slice(
  0,
  placements.length,
).entries()) {
  progression.classes[spec.id] = Object.fromEntries(
    TRACKS.flatMap((track, i) => {
      const position = placements[index][i];
      return position
        ? [[track.layoutId, { bestPosition: position, won: position === 1 }]]
        : [];
    }),
  );
}
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript((seed) => {
    if (!localStorage.getItem("trophy-qa-seeded")) {
      localStorage.setItem("nv-progression", JSON.stringify(seed));
      localStorage.setItem("nv-records", '{"qa-untouched":123}');
      localStorage.setItem("trophy-qa-seeded", "true");
    }
    window.trophyPad = null;
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.trophyPad],
    });
  }, progression);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  for (let classIndex = 0; classIndex < placements.length; classIndex++) {
    await goToSetupStage(page, "class");
    await page.locator(`#speed-class input[value="${classIndex}"]`).check();
    await goToSetupStage(page, "track");
    const buttons = page.locator("#tracks .choice");
    for (let i = 0; i < TRACKS.length; i++) {
      const button = buttons.nth(i);
      const position = placements[classIndex][i];
      const trophy = button.locator(".track-trophy");
      if (position && position <= 3) {
        await expect(trophy).toBeVisible();
        await expect(trophy).toHaveAttribute("data-place", String(position));
        await expect(button.locator(".track-progress")).toContainText(
          `BEST / ${position}`,
        );
        const geometry = await button.evaluate((element) => {
          const icon = element.querySelector("svg").getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return {
            contained:
              icon.x >= bounds.x &&
              icon.right <= bounds.right &&
              icon.y >= bounds.y &&
              icon.bottom <= bounds.bottom,
            clear: [
              ...element.querySelectorAll("b, small:not([hidden])"),
            ].every((label) => label.getBoundingClientRect().right <= icon.x),
          };
        });
        expect(geometry).toEqual({ contained: true, clear: true });
      } else await expect(trophy).toBeHidden();
      if (i >= 3) await expect(button).toBeDisabled();
    }
    if (classIndex === 0) {
      await page.screenshot({
        path: `test-artifacts/trophies-${viewport.width}x${viewport.height}-unselected.png`,
      });
      const silver = buttons.nth(1);
      if (mobile) await silver.tap();
      else await silver.click();
      await expect(silver).toHaveClass(/active/);
      await page.screenshot({
        path: `test-artifacts/trophies-${viewport.width}x${viewport.height}-silver.png`,
      });
      await buttons.nth(2).click();
      await expect(buttons.nth(2)).toHaveClass(/active/);
      await page.screenshot({
        path: `test-artifacts/trophies-${viewport.width}x${viewport.height}-bronze.png`,
      });
      await buttons.nth(0).click();
      await page.keyboard.press("ArrowRight");
      await expect(buttons.nth(1)).toHaveClass(/active/);
      await page.evaluate(() => {
        window.trophyPad = {
          axes: [0, 0],
          buttons: Array.from({ length: 16 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.trophyPad.buttons[14] = { pressed: true, value: 1 };
      });
      await expect(buttons.nth(0)).toHaveClass(/active/);
      await page.evaluate(() => {
        window.trophyPad = null;
      });
      await page.screenshot({
        path: `test-artifacts/trophies-${viewport.width}x${viewport.height}-gold.png`,
      });
    }
    await goToSetupStage(page, "mode");
    await page.locator('input[name="mode"][value="trial"]').check();
    await goToSetupStage(page, "track");
    expect(await page.locator(".track-trophy:not([hidden])").count()).toBe(0);
    await expect(buttons.nth(3)).toBeDisabled();
    await goToSetupStage(page, "mode");
    await page.locator('input[name="mode"][value="race"]').check();
  }
  await page.reload();
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nv-progression")),
    ),
  ).toEqual(progression);
  expect(await page.evaluate(() => localStorage.getItem("nv-records"))).toBe(
    '{"qa-untouched":123}',
  );
  expect(errors).toEqual([]);
  console.log(
    `PASS trophies ${viewport.width}x${viewport.height}: original classes, places 1–8/no result, shared locks, mode isolation, touch/keyboard/gamepad, reload and storage`,
  );
} finally {
  await browser.close();
}
