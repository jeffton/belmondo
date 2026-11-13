import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5197";
const output =
  process.env.COURSE_ARTIFACTS || "/var/tmp/belmondo-menu-loading/qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const reports = [];
try {
  const viewports = process.env.COURSE_VIEWPORTS
    ? JSON.parse(process.env.COURSE_VIEWPORTS)
    : [
        [1440, 900],
        [390, 844],
      ];
  for (const [width, height] of viewports) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: width < 900 ? 2 : 1,
      isMobile: width < 900,
      hasTouch: width < 900,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.courseLongTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          window.courseLongTasks.push({ start: e.startTime, ms: e.duration });
      }).observe({ type: "longtask", buffered: true });
    });
    // Keep the first worker pending while the user changes the initial course.
    // Bootstrap must wait for a committed scene, not the cancelled first request.
    let releaseInitial;
    const initialGate = new Promise((resolve) => {
      releaseInitial = resolve;
    });
    let firstWorker = true;
    await page.route("**/course-preparation.worker*", async (route) => {
      if (firstWorker) {
        firstWorker = false;
        await initialGate;
      }
      await route.continue();
    });
    await page.goto(url);
    await page.waitForFunction(
      () =>
        document.getElementById("tracks").getAttribute("aria-busy") === "true",
    );
    for (const dialog of ["help", "music"]) {
      await page.locator(`#${dialog}-open`).click();
      await expect(page.locator(`#${dialog}-dialog`)).toBeVisible();
      await page.locator(`#${dialog}-dialog .close`).click();
    }
    await page.locator('input[name="speed-class"][value="2"]').check();
    await page.locator("#setup-next").click();
    await page.locator("#tracks button").nth(6).click();
    releaseInitial();
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    expect(
      await page.evaluate(() => window.nullVector.telemetry.loadedTrack),
    ).toBe(6);
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    const moving = await page.evaluate(
      () => window.nullVector.telemetry.menuRacers[0].s,
    );
    await page.waitForFunction(
      (s) => window.nullVector.telemetry.menuRacers[0].s > s,
      moving,
    );
    const switches = [];
    for (const i of process.env.COURSE_INDICES
      ? JSON.parse(process.env.COURSE_INDICES)
      : [0, 1, 2, 3, 4, 5, 6]) {
      const click = await page.evaluate((i) => {
        window.courseLongTasks = [];
        const start = performance.now();
        document.querySelectorAll("#tracks button")[i].click();
        return { start, handlerMs: performance.now() - start };
      }, i);
      await page.waitForFunction((i) => {
        const t = window.nullVector.telemetry;
        return !t.trackLoading && t.loadedTrack === i;
      }, i);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => setTimeout(resolve, 0)),
            ),
          ),
      );
      const result = await page.evaluate((start) => {
        const t = window.nullVector.telemetry;
        return {
          ...t.trackLoadTiming,
          presentedMs: performance.now() - start,
          maxTaskMs: Math.max(
            0,
            ...window.courseLongTasks
              .filter((e) => e.start >= start)
              .map((e) => e.ms),
          ),
          resources: t.resources,
          preview: t.previewResources,
          selected: t.selectedTrack,
          loaded: t.loadedTrack,
        };
      }, click.start);
      expect(result.loaded).toBe(i);
      expect(result.selected).toBe(i);
      switches.push({ i, handlerMs: click.handlerMs, ...result });
      console.log(
        JSON.stringify({ width, i, handlerMs: click.handlerMs, ...result }),
      );
    }
    // Force cancellation in the worker and then after detached scene building starts.
    for (const delay of [0, 350]) {
      await page.evaluate(() =>
        document.querySelectorAll("#tracks button")[1].click(),
      );
      if (delay) await page.waitForTimeout(delay);
      await page.evaluate(() => {
        for (const i of [5, 2, 4, 0, 6])
          document.querySelectorAll("#tracks button")[i].click();
      });
      await page.waitForFunction(() => {
        const t = window.nullVector.telemetry;
        return !t.trackLoading && t.selectedTrack === 6 && t.loadedTrack === 6;
      });
      await expect(page.locator("#start")).toBeEnabled();
    }
    const before = await page.evaluate(
      () => window.nullVector.telemetry.menuModelRotation,
    );
    await page.waitForFunction(
      (r) => window.nullVector.telemetry.menuModelRotation !== r,
      before,
    );
    await page.screenshot({ path: `${output}/${width}-circuit.png` });
    await page.locator("#setup-next").click();
    await page.screenshot({ path: `${output}/${width}-craft.png` });
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(
      await page.evaluate(() => window.nullVector.telemetry.loadedTrack),
    ).toBe(6);
    expect(
      await page.evaluate(() => window.nullVector.telemetry.speedClass),
    ).toBe(2);
    reports.push({ width, height, switches });
    await page.close();
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ reports, errors }, null, 2),
  );
  console.log(JSON.stringify({ reports, errors }, null, 2));
} finally {
  await browser.close();
}
