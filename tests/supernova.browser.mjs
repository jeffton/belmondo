import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { TRACKS } from "../src/track.ts";

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
        ? { width: 320, height: 568 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    try {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const wins = {
        version: 2,
        classes: {
          c3: Object.fromEntries(
            TRACKS.map(({ layoutId }) => [
              layoutId,
              { bestPosition: 1, won: true },
            ]),
          ),
        },
      };
      if (!mobile)
        await page.addInitScript((saved) => {
          localStorage.setItem("nv-progression", JSON.stringify(saved));
        }, wins);

      const activate = (selector) => {
        const target = page.locator(selector);
        return mobile ? target.tap() : target.click();
      };
      await page.goto(url);
      await page.waitForFunction(() => window.nullVector?.telemetry);
      const option = page.locator('input[name="speed-class"][value="3"]');
      const requirement = page.locator("#supernova-lock");
      const tracks = page.locator("#tracks button");
      const badge = page.locator("#circuit-test-access");
      await activate("#setup-next");
      if (mobile) {
        await expect(option).toBeDisabled();
        await expect(requirement).toBeVisible();
        const { lockBottom, selectTop } = await page.evaluate(() => ({
          lockBottom: document
            .querySelector("#supernova-lock")
            .getBoundingClientRect().bottom,
          selectTop: document
            .querySelector("#setup-next")
            .getBoundingClientRect().top,
        }));
        expect(lockBottom).toBeLessThan(selectTop);
        const contained = await page
          .locator("#speed-class label")
          .evaluateAll((choices) =>
            choices.every((choice) => {
              const card = choice.getBoundingClientRect();
              return [
                ...choice.querySelectorAll("b, small:not([hidden])"),
              ].every((label) => {
                const range = document.createRange();
                range.selectNodeContents(label);
                const text = range.getBoundingClientRect();
                return text.left >= card.left && text.right <= card.right;
              });
            }),
          );
        expect(contained).toBe(true);
        await activate("#setup-back");
        for (let tap = 0; tap < 5; tap++) await activate(".wordmark");
        await expect(badge).toBeVisible();
        await activate("#setup-next");
      }
      await expect(option).toBeEnabled();
      await expect(requirement).toBeHidden();
      await activate('input[name="speed-class"][value="3"]');
      await expect(option).toBeChecked();
      await expect(page.locator("#model-name")).toHaveText("SUPERNOVA");
      await activate("#setup-next");
      await expect(page.locator("#tracks button:enabled")).toHaveCount(
        mobile ? TRACKS.length : 3,
      );
      if (mobile) {
        await activate("#tracks button:last-child");
        await expect(tracks.last()).toHaveAttribute("aria-pressed", "true");
        await activate("#circuit-test-access");
        await expect(badge).toBeHidden();
        await expect(tracks.first()).toHaveAttribute("aria-pressed", "true");
        await activate("#setup-back");
        await expect(option).toBeDisabled();
        await expect(page.locator("#model-name")).toHaveText("SINGULARITY");
        expect(
          await page.evaluate(() => localStorage.getItem("nv-progression")),
        ).toBeNull();

        await activate("#setup-back");
        for (let tap = 0; tap < 5; tap++) await activate(".wordmark");
        await activate("#setup-next");
        await activate('input[name="speed-class"][value="3"]');
        await activate("#setup-next");
      }
      await activate("#setup-next");
      await activate("#start");
      await expect(page.locator("#hud")).toBeVisible({ timeout: 45000 });
      expect(
        await page.evaluate(() => {
          const t = window.nullVector.telemetry;
          return [t.state, t.classId, t.laps];
        }),
      ).toEqual(["race", "c4", 5]);
      expect(errors).toEqual([]);
      console.log(
        `SUPERNOVA ${mobile ? "320px touch + test mode" : "desktop + saved victories"} PASS`,
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server?.close();
}
