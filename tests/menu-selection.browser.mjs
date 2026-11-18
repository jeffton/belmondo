import { chromium, webkit, expect } from "@playwright/test";

const webKit = process.env.MENU_ENGINE === "webkit";
const url = process.env.GAME_URL || "http://127.0.0.1:5196";
const browser = await (webKit ? webkit : chromium).launch(
  webKit
    ? {}
    : {
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      },
);
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.selectionPad = { axes: [0, 0, 0, 0], buttons: [] };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.selectionPad],
    });
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  const selectors = {
    mode: "#mode .binary-options label span",
    class: ".speed-choices .choice",
    track: "#tracks .choice",
    craft: "#crafts .choice",
  };
  const kinds = {
    mode: "#mode input:checked",
    class: ".speed-choices input:checked",
    track: '#tracks [aria-pressed="true"]',
    craft: '#crafts [aria-pressed="true"]',
  };
  const selection = async (stage, mode) => {
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", stage);
    const picked = page.locator(kinds[stage]);
    await expect(picked).toHaveCount(1);
    if (mode) await expect(picked).toHaveValue(mode);
    const red = await page
      .locator(selectors[stage])
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              getComputedStyle(node).backgroundColor === "rgb(251, 77, 43)",
          ).length,
      );
    expect(red, `${stage} has exactly one red option`).toBe(1);
  };
  const pad = async (index) => {
    await page.evaluate((index) => {
      window.selectionPad.buttons = Array.from({ length: 17 }, (_, i) => ({
        pressed: i === index,
        value: Number(i === index),
      }));
    }, index);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
  };
  await selection("mode", "race");
  const trial = page.locator('#mode label:has(input[value="trial"])');
  // Leave the real pointer cursor on TIME ATTACK without a committed click.
  // Chromium can hold/cancel an actual touch; WebKit covers the same DOM
  // transition plus actual taps, since Playwright does not expose CDP there.
  if (!webKit) {
    const cdp = await context.newCDPSession(page);
    const box = await trial.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(trial).toHaveClass(/menu-cursor/);
    await selection("mode", "race");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await trial.dispatchEvent("pointerdown", {
      pointerType: "touch",
      bubbles: true,
    });
    await trial.dispatchEvent("pointercancel", {
      pointerType: "touch",
      bubbles: true,
    });
  }
  await selection("mode", "race");
  await page.keyboard.press("Enter");
  await selection("class");
  await page.keyboard.press("Escape");
  await selection("mode", "race");
  await trial.tap();
  await selection("mode", "trial");
  await page.locator("#render-quality").tap();
  await selection("mode", "trial");
  expect(
    await page
      .locator("#render-quality")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).not.toBe("rgb(251, 77, 43)");
  // Keyboard restarts from the committed choice after a touch footer cursor.
  await page.keyboard.press("ArrowUp");
  await selection("mode", "race");
  await trial.tap();
  await selection("mode", "trial");
  await pad(12);
  await selection("mode", "race");
  await pad(-1);
  await page.keyboard.press("ArrowDown");
  await selection("mode", "trial");
  await page.keyboard.press("Enter");
  await selection("class");
  await page.locator("#setup-next").tap();
  await selection("track");
  await page.locator("#setup-next").tap();
  await selection("craft");
  await page.locator("#setup-back").tap();
  await selection("track");
  await page.locator("#setup-back").tap();
  await selection("class");
  await page.locator("#setup-back").tap();
  await selection("mode", "trial");
  expect(errors).toEqual([]);
  console.log(
    `${webKit ? "WebKit" : "Chromium"}: fresh Combat, non-commit, single selection on all stages, input switch, and retained choice PASS`,
  );
} finally {
  await browser.close();
}
