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
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 320, height: 568 },
    { width: 568, height: 320 },
  ]) {
    const mobile = viewport.width < 700;
    const savedWins = !mobile;
    const page = await browser.newPage({
      viewport,
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
      if (savedWins)
        await page.addInitScript((saved) => {
          // Start locked, then reload with wins to exercise both desktop states.
          if (sessionStorage.getItem("save-wins"))
            localStorage.setItem("nv-progression", JSON.stringify(saved));
        }, wins);

      const activate = (selector) => {
        const target = page.locator(selector);
        return mobile ? target.tap() : target.click();
      };
      await page.goto(url);
      await page.waitForFunction(() => window.nullVector?.telemetry);
      const option = page.locator('input[name="speed-class"][value="3"]');
      const lock = page.locator("#supernova-lock");
      const tracks = page.locator("#tracks button");
      const badge = page.locator("#circuit-test-access");
      async function checkClassLayout() {
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const cards = await page
          .locator("#speed-class label")
          .evaluateAll((choices) => {
            const navTop = document
              .querySelector("#setup-next")
              .getBoundingClientRect().top;
            return choices.map((choice) => {
              const card = choice.getBoundingClientRect();
              const labels = [
                ...choice.querySelectorAll("b, small:not([hidden])"),
              ];
              const textRects = labels.map((label) => {
                const range = document.createRange();
                range.selectNodeContents(label);
                return range.getBoundingClientRect();
              });
              return {
                width: card.width,
                height: card.height,
                inViewport:
                  card.left >= 0 &&
                  card.right <= innerWidth &&
                  card.top >= 0 &&
                  card.bottom < navTop,
                textFits: textRects.every(
                  (text) =>
                    text.left >= card.left &&
                    text.right <= card.right &&
                    text.top >= card.top &&
                    text.bottom <= card.bottom,
                ),
                labelsSeparate:
                  textRects.length === 1 ||
                  textRects[0].right <= textRects[1].left ||
                  textRects[0].bottom <= textRects[1].top,
              };
            });
          });
        expect(cards).toHaveLength(4);
        for (const {
          width,
          height,
          inViewport,
          textFits,
          labelsSeparate,
        } of cards) {
          expect(Math.abs(width - cards[0].width)).toBeLessThan(1);
          expect(Math.abs(height - cards[0].height)).toBeLessThan(1);
          expect({ inViewport, textFits, labelsSeparate }).toEqual({
            inViewport: true,
            textFits: true,
            labelsSeparate: true,
          });
        }
      }
      await activate("#setup-next");
      await expect(option).toBeDisabled();
      await checkClassLayout();
      await expect(lock).toBeVisible();
      await expect(lock).toHaveText("🔒 LOCKED");
      await expect(option).toHaveAccessibleName("SUPERNOVA");
      if (savedWins) {
        await page.evaluate(() => sessionStorage.setItem("save-wins", "yes"));
        await page.reload();
        await page.waitForFunction(() => window.nullVector?.telemetry);
      } else {
        await activate("#setup-back");
        for (let tap = 0; tap < 5; tap++) await activate(".wordmark");
        await expect(badge).toBeVisible();
      }
      await activate("#setup-next");
      await expect(option).toBeEnabled();
      await expect(lock).toBeHidden();
      await expect(option).toHaveAccessibleName("SUPERNOVA");
      await checkClassLayout();
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
        `SUPERNOVA ${viewport.width}×${viewport.height} ${mobile ? "touch + test mode" : "desktop + saved victories"} PASS`,
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server?.close();
}
