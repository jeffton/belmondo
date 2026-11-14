import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { mkdir } from "node:fs/promises";

const viewport = JSON.parse(process.env.MENU_VIEWPORT || "[1280,800]");
const output = process.env.MENU_ARTIFACTS || "/var/tmp/belmondo-menu-layout";
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] },
    deviceScaleFactor: 2,
    hasTouch: viewport[0] < 900,
  });
  const errors = [];
  const navigationBoxes = [];
  const captureNavigation = async (stage) => {
    const boxes = await page
      .locator(".setup-navigation button:visible")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { id: button.id, x, y, width, height };
        }),
      );
    const select = boxes.find((box) => box.id !== "setup-back");
    const previous = navigationBoxes[0]?.select;
    if (previous)
      for (const key of ["x", "y", "width", "height"])
        expect(
          Math.abs(select[key] - previous[key]),
          `${stage} Select ${key}`,
        ).toBeLessThan(1);
    const back = boxes.find((box) => box.id === "setup-back");
    const previousBack = navigationBoxes.find((entry) => entry.back)?.back;
    if (back && previousBack)
      for (const key of ["x", "y", "width", "height"])
        expect(
          Math.abs(back[key] - previousBack[key]),
          `${stage} Back ${key}`,
        ).toBeLessThan(1);
    navigationBoxes.push({ stage, select, back });
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.GAME_URL || server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
  await captureNavigation("mode");
  await expect(page.locator("h1.wordmark")).toBeVisible();
  await expect(page.locator(".world-caption")).toBeHidden();
  await page.screenshot({ path: `${output}/${viewport.join("x")}-mode.png` });
  await page.keyboard.press("Enter");
  await captureNavigation("class");
  const classDirection = await page
    .locator("#speed-class label")
    .evaluateAll((labels) =>
      Math.abs(
        labels[0].getBoundingClientRect().top -
          labels[1].getBoundingClientRect().top,
      ) < 2
        ? "ArrowRight"
        : "ArrowDown",
    );
  await page.keyboard.press(classDirection);
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await captureNavigation("track");
  await expect(page.locator("h1.wordmark")).toBeHidden();
  await page.waitForFunction(() => !window.nullVector.telemetry.trackLoading);
  const sizes = await page.locator("#tracks button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const { width, height } = button.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(
    Math.max(...sizes.map((size) => size.height)) -
      Math.min(...sizes.map((size) => size.height)),
  ).toBeLessThan(1);
  expect(
    Math.max(...sizes.map((size) => size.width)) -
      Math.min(...sizes.map((size) => size.width)),
  ).toBeLessThan(1);
  await expect(page.locator("#render-quality .quality-label")).toBeVisible();
  const footerTargets = await page
    .locator(".menu-footer .menu-links > *, #render-quality")
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const box = control.getBoundingClientRect();
          return {
            id: control.id,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        })
        .sort((a, b) => a.left - b.left),
    );
  expect(footerTargets).toHaveLength(5);
  expect(
    footerTargets.every(
      (control) =>
        control.width >= 44 &&
        control.height >= 44 &&
        Math.abs(control.top - footerTargets[0].top) < 1,
    ),
  ).toBe(true);
  for (let i = 1; i < footerTargets.length; i++)
    expect(footerTargets[i].left).toBeGreaterThanOrEqual(
      footerTargets[i - 1].right,
    );
  expect(footerTargets[0].left).toBeGreaterThanOrEqual(0);
  expect(footerTargets.at(-1).right).toBeLessThanOrEqual(viewport[0]);
  for (const dialog of ["help", "music", "art"]) {
    await page.locator(`#${dialog}-open`).click();
    await expect(page.locator(`#${dialog}-dialog`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(`#${dialog}-dialog`)).not.toBeVisible();
  }
  await page.context().route("https://github.com/jeffton/belmondo", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>BELMONDO repository</title>",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await page.locator('a[aria-label="BELMONDO on GitHub"]').click();
  const popup = await popupPromise;
  await popup.waitForURL("https://github.com/jeffton/belmondo");
  await popup.close();
  await page.bringToFront();
  if (viewport[0] < 900) {
    await page.locator("#quality").tap();
    await expect(page.locator("#quality")).not.toBeChecked();
    await expect(page.locator("#quality-state")).toHaveText("OFF");
    await page.locator("#quality").tap();
    await expect(page.locator("#quality")).toBeChecked();
    await expect(page.locator("#quality-state")).toHaveText("ON");
  }
  const signatures = await page
    .locator(".setup-navigation button:visible")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        height: button.getBoundingClientRect().height,
        background: getComputedStyle(button).backgroundColor,
        border: getComputedStyle(button).borderTopWidth,
      })),
    );
  const touchInput =
    (await page.locator("body").getAttribute("data-input-mode")) === "touch";
  expect(
    signatures.every(
      (control) =>
        control.height >= 44 &&
        (touchInput
          ? control.border === "1px" &&
            control.background !== "rgba(0, 0, 0, 0)" &&
            control.background !== "rgb(255, 101, 77)"
          : control.background === "rgba(0, 0, 0, 0)" &&
            control.border === "0px"),
    ),
  ).toBe(true);
  if (viewport[0] < 900) await page.locator("#setup-back").tap();
  else await page.locator("#setup-back").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  if (viewport[0] < 900) {
    await expect(page.locator("#setup-next")).toHaveCSS(
      "border-top-width",
      "1px",
    );
    expect(
      await page
        .locator("#setup-next")
        .evaluate((button) => getComputedStyle(button).backgroundColor),
    ).not.toBe("rgb(255, 101, 77)");
  }
  if (viewport[0] < 900) await page.locator("#setup-next").tap();
  else await page.locator("#setup-next").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await expect(page.locator("#model-subtitle")).toBeVisible();
  await expect(page.locator("#model-subtitle")).toHaveText("Polar observatory");
  await expect(page.locator("#tracks .track-lock").last()).toBeVisible();
  await page.screenshot({ path: `${output}/${viewport.join("x")}-track.png` });
  await page.keyboard.press("Enter");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "craft");
  await captureNavigation("craft");
  await expect(page.locator("h1.wordmark")).toBeHidden();
  await expect(page.locator("#crafts .active")).toHaveClass(/menu-cursor/);
  await expect(page.locator("#crafts button small")).toHaveText([
    "AGILE",
    "BALANCED",
    "HIGH VELOCITY",
  ]);
  await expect(page.locator("#craft-note")).toHaveCount(0);
  await expect(page.locator("#menu-model")).not.toContainText(
    /AGILE|BALANCED|HIGH VELOCITY/,
  );
  const actionTextFits = await page.locator("#start").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return [...button.childNodes]
      .filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
      .every((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].every(
          (text) => text.top >= rect.top && text.bottom <= rect.bottom,
        );
      });
  });
  expect(actionTextFits).toBe(true);
  await page.screenshot({ path: `${output}/${viewport.join("x")}-craft.png` });
  await expect(page.locator("#start")).toBeEnabled();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect(page.locator("#resume")).toHaveClass(/menu-cursor/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#restart")).toHaveClass(/menu-cursor/);
  const pauseSizes = await page
    .locator("#pause-panel .panel > button")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        width: button.offsetWidth,
        height: button.offsetHeight,
      })),
    );
  expect(new Set(pauseSizes.map((size) => size.width)).size).toBe(1);
  expect(new Set(pauseSizes.map((size) => size.height)).size).toBe(1);
  await page.screenshot({ path: `${output}/${viewport.join("x")}-pause.png` });
  await page.locator("#quit").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await expect(page.locator(".world-caption")).toBeHidden();
  await page.screenshot({ path: `${output}/${viewport.join("x")}-class.png` });
  // The actual quality control updates the independently rendered model buffer.
  await page.locator("#quality").uncheck();
  await page.waitForFunction(() => {
    const t = window.nullVector.telemetry;
    return t.previewResources.pixelRatio === devicePixelRatio;
  });
  await page.locator("#quality").check();
  await page.waitForFunction(() => {
    const t = window.nullVector.telemetry;
    return t.previewResources.pixelRatio === 0.55;
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("h1.wordmark")).toBeVisible();
  await expect(page.locator(".world-caption")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.locator("h1.wordmark")).toBeHidden();
  await page.evaluate((direction) => {
    window.virtualMenuPad = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [null, window.virtualMenuPad],
    });
    window.virtualMenuPad.buttons[direction === "ArrowDown" ? 12 : 14].pressed =
      true;
  }, classDirection);
  await expect(
    page.locator('input[name="speed-class"][value="0"]'),
  ).toBeChecked();
  await page.evaluate((direction) => {
    window.virtualMenuPad.buttons[direction === "ArrowDown" ? 12 : 14].pressed =
      false;
  }, classDirection);
  await expect(page.locator("body")).toHaveAttribute(
    "data-gamepad-connected",
    "true",
  );
  expect(
    await page
      .locator("#setup-next")
      .evaluate((button) => getComputedStyle(button, "::before").content),
  ).toContain("Ⓐ");
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[0].pressed = true;
  });
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[0].pressed = false;
  });
  await expect(page.locator("body")).toHaveAttribute(
    "data-input-mode",
    "gamepad",
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.evaluate(() => {
    window.virtualMenuPad.buttons[1].pressed = true;
  });
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await page.evaluate(() => {
    window.virtualMenuPad = null;
  });
  await expect(page.locator("body")).toHaveAttribute(
    "data-gamepad-connected",
    "false",
  );
  expect(errors).toEqual([]);
  console.log(
    `Real WebGL menu, equal buttons, keyboard race/pause, LOWRES PASS ${viewport.join("×")}`,
  );
} finally {
  await browser.close();
  await server.close();
}
