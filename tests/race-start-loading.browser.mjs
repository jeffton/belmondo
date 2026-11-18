import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const server = process.env.GAME_URL
  ? null
  : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const url = process.env.GAME_URL || server.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    try {
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const worker = "**/assets/course-preparation.worker-*.js";
      const pendingWorkers = [];
      await page.route(worker, (route) => pendingWorkers.push(route));
      const releaseWorker = async (fail = false) => {
        await expect.poll(() => pendingWorkers.length).toBe(1);
        const route = pendingWorkers.shift();
        if (fail) await route.abort("failed");
        else await route.continue();
      };
      await page.goto(url);
      await expect(page.locator("#tracks")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      const activate = mobile
        ? (selector) => page.locator(selector).tap()
        : () => page.keyboard.press("Enter");
      for (let i = 0; i < 3; i++) await activate("#setup-next");
      await expect(page.locator("#menu")).toHaveAttribute(
        "data-stage",
        "craft",
      );
      const start = page.locator("#start");
      await activate("#start");
      await expect(start).toHaveText("LOADING…");
      await expect(page.locator("#start-status")).toContainText("Preparing");
      await expect(page.locator("#menu")).toBeVisible();
      await expect(page.locator("#hud")).toBeHidden();
      if (mobile) {
        // Fail the very first worker: the UI must stay responsive and retry
        // must bootstrap the game without a reload or another START input.
        await releaseWorker(true);
        await expect(start).toHaveText("RETRY");
        await expect(start).toBeEnabled();
        await expect(page.locator("#start-status")).toContainText(
          "Could not load",
        );
        await activate("#start");
        await expect(start).toHaveText("LOADING…");
      }
      await releaseWorker();
      await expect(page.locator("#hud")).toBeVisible({ timeout: 45000 });
      await expect(page.locator("#menu")).toBeHidden();
      await page.waitForFunction(
        () => window.nullVector?.telemetry.time > 0,
        undefined,
        { timeout: 45000 },
      );
      expect(
        await page.evaluate(() => {
          const t = window.nullVector.telemetry;
          return [t.state, t.loadedTrack, t.selectedTrack, t.drawCalls > 0];
        }),
      ).toEqual(["race", 0, 0, true]);
      console.log(
        `Cold ${mobile ? "touch after worker-error retry" : "keyboard"}: one input starts a rendered race`,
      );

      // A pending start must not survive Back or start a race behind a dialog.
      if (mobile) await page.locator("#pause").tap();
      else await page.keyboard.press("Escape");
      await page.locator("#quit").click();
      await page.locator('#tracks button[data-index="1"]').click();
      await activate("#setup-next");
      await activate("#start");
      await expect(start).toHaveText("LOADING…");
      const briefing = page.locator("#help-dialog");
      if (mobile) {
        await page.locator("#help-open").tap();
        await expect(briefing).toBeVisible();
      } else {
        await page.keyboard.press("Escape");
        await expect(page.locator("#menu")).toHaveAttribute(
          "data-stage",
          "track",
        );
      }
      await releaseWorker();
      await page.waitForFunction(
        () => !window.nullVector.telemetry.trackLoading,
      );
      expect(
        await page.evaluate(() => {
          const t = window.nullVector.telemetry;
          return [t.state, t.loadedTrack, t.selectedTrack];
        }),
      ).toEqual(["menu", 1, 1]);
      await expect(page.locator("#hud")).toBeHidden();
      if (mobile) {
        await expect(briefing).toBeVisible();
        await briefing.locator(".close").tap();
      } else await activate("#setup-next");
      await activate("#start");
      await expect(page.locator("#hud")).toBeVisible({ timeout: 45000 });
      await expect(page.locator("#hud-track")).toContainText("MONSOON");
      expect(pageErrors).toEqual([]);
      console.log(
        `${mobile ? "Touch: opening a dialog" : "Keyboard: Back"} cancels queued start; next START launches selected circuit`,
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server?.close();
}
