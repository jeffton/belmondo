import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { prepareRaceSetup } from "./helpers/setup-menu.mjs";

// Real renderer/Race; only OS safe-area values are supplied by the fixture.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, watch: null },
});
await server.listen();
const output = "/var/tmp/belmondo-touch-pad-sizing-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await prepareRaceSetup(page, { mode: "trial" });
  await page.locator("#start").tap();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  for (const [name, width, height, left, right, top, bottom] of [
    ["portrait", 390, 844, 0, 0, 47, 34],
    ["landscape", 844, 390, 47, 47, 0, 21],
    ["short-landscape", 568, 320, 44, 0, 0, 21],
    ["compact", 320, 568, 0, 0, 0, 0],
  ]) {
    await page.setViewportSize({ width, height });
    const override = await page.addStyleTag({
      content: `#hud { --hud-safe-left: ${left}px; --hud-safe-right: ${right}px; --hud-safe-top: ${top}px; --hud-safe-bottom: ${bottom}px; }`,
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return document.fonts.ready.then(() => undefined);
    });
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const { x, y, width, height } = document
          .querySelector(selector)
          .getBoundingClientRect();
        return { x, y, width, height };
      };
      return Object.fromEntries(
        [
          "#steer-pad",
          "#air-pad",
          "#touch-fire",
          ".shield",
          ".velocity",
          ".race-position",
          ".lap",
          "#timer",
          "#lap-times",
          "#view",
          "#pause",
        ].map((selector) => [selector, rect(selector)]),
      );
    });
    const overlap = (a, b) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    const items = Object.keys(geometry);
    for (const [i, selector] of items.entries()) {
      const box = geometry[selector];
      assert(
        box.x >= left && box.x + box.width <= width - right,
        `${name}: ${selector} outside horizontal safe area`,
      );
      assert(
        box.y >= top && box.y + box.height <= height - bottom,
        `${name}: ${selector} outside vertical safe area`,
      );
      for (const other of items.slice(i + 1))
        assert(
          !overlap(box, geometry[other]),
          `${name}: ${selector} overlaps ${other}`,
        );
    }
    assert.equal(geometry["#touch-fire"].width, geometry["#air-pad"].width);
    for (const control of ["#pause", "#view", "#touch-fire"]) {
      assert(geometry[control].width >= 44);
      assert(geometry[control].height >= 44);
    }
    await page.screenshot({ path: `${output}/${name}.png` });
    results.push({
      name,
      width,
      height,
      safeArea: { left, right, top, bottom },
      geometry,
    });
    await override.evaluate((element) => element.remove());
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ output, cases: results.length, errors }));
} finally {
  await browser.close();
  await server.close();
}
