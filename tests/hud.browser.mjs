import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Full production DOM/CSS + shared inventory function, with no application or
// renderer running. Browser-input application coverage lives in input-chords.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
await mkdir("test-artifacts", { recursive: true });
const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace("</head>", '<link rel="stylesheet" href="/src/style.css"></head>');
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const report = {
  method:
    "isolated full production HUD DOM/CSS fixture; no simulation mutation",
  url,
  cases: [],
  errors: [],
};
try {
  for (const [device, viewport, touch] of [
    ["desktop", { width: 1440, height: 900 }, false],
    ["landscape", { width: 844, height: 390 }, true],
    ["portrait", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/__hud_fixture__.html", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto(`${url}/__hud_fixture__.html`);
    await page.evaluate(async (touch) => {
      document.querySelector("#menu").hidden = true;
      document.querySelector("#hud").hidden = false;
      document.body.classList.toggle("touch", touch);
      const { createWeaponHUD } = await import("/src/weapon-ui.js");
      window.updateFixtureHUD = createWeaponHUD(
        document.querySelector("#weapon"),
        document.querySelector("#touch-fire"),
        document.querySelector("#weapon-roster"),
      );
      document.querySelector("#timer").textContent = "03:59.99";
      document.querySelector("#hud-track").textContent = "NOCTILUCENT DOCKS";
      await document.fonts.ready;
    }, touch);
    const glyphs = new Set(),
      colors = new Set();
    for (const weapon of [
      null,
      "MISSILE",
      "PULSE",
      "MINE",
      "SHIELD",
      "TURBO",
      null,
    ]) {
      await page.evaluate((weapon) => window.updateFixtureHUD(weapon), weapon);
      const state = await page.evaluate(() => {
        const button = document.querySelector("#weapon");
        const inventory = button.parentElement;
        const rect = (element) => {
          const r = element.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        };
        const visible = (el) =>
          !!(
            el.getClientRects().length &&
            getComputedStyle(el).visibility !== "hidden"
          );
        const selectors = [
          "#position",
          "#lap",
          "#lap-times",
          "#hud-track",
          "#timer",
          "#view",
          "#pause",
          "#steer-pad",
          "#touch-fire",
          '[data-control="airLeft"]',
          '[data-control="airRight"]',
          '[data-control="brake"]',
          ".velocity",
          ".shield",
        ];
        return {
          hidden: inventory.hidden,
          inventory: rect(inventory),
          button: rect(button),
          text: inventory.textContent.trim(),
          label: button.getAttribute("aria-label"),
          glyph: button.querySelector("svg")?.innerHTML,
          color: button.style.getPropertyValue("--weapon-color"),
          name: button.querySelector(".weapon-name")
            ? rect(button.querySelector(".weapon-name"))
            : null,
          nameOverflow: button.querySelector(".weapon-name")
            ? button.querySelector(".weapon-name").scrollWidth >
              button.querySelector(".weapon-name").clientWidth
            : false,
          fireText: document.querySelector("#touch-fire").textContent.trim(),
          fireIcons: document.querySelectorAll(
            "#touch-fire svg, #touch-fire .weapon-name",
          ).length,
          controls: Object.fromEntries(
            selectors.map((selector) => [
              selector,
              {
                visible: visible(document.querySelector(selector)),
                ...rect(document.querySelector(selector)),
              },
            ]),
          ),
        };
      });
      expect(state.fireText).toBe("FIRE");
      await expect(page.locator("#weapon .weapon-action")).toHaveCount(0);
      if (weapon) {
        await expect(page.locator("#weapon")).toHaveText(weapon);
        await expect(page.locator("#weapon")).toHaveAttribute(
          "aria-label",
          `Fire ${weapon}`,
        );
      }
      if (touch) {
        const fire = page.locator("#touch-fire");
        await expect(fire).toBeVisible();
        await expect(fire).toBeEnabled();
        const bounds = await fire.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
        expect(
          await fire.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        ).toBe(true);
      }
      expect(state.fireIcons).toBe(0);
      expect(state.hidden).toBe(weapon === null);
      if (weapon === null) {
        expect(state.inventory.width * state.inventory.height).toBe(0);
        expect(state.text).not.toContain("EMPTY");
        expect(await page.locator("#weapon").innerHTML()).toBe("");
      } else {
        await expect(page.locator("#weapon")).toBeVisible();
        expect(state.inventory.width).toBeGreaterThan(0);
        expect(state.inventory.height).toBeGreaterThan(0);
        expect(state.button.width).toBeGreaterThan(0);
        expect(state.button.height).toBeGreaterThan(0);
        expect(state.text).toContain(weapon);
        expect(state.label).toBe(`Fire ${weapon}`);
        expect(state.nameOverflow).toBe(false);
        expect(state.inventory.y).toBeGreaterThanOrEqual(0);
        expect(state.inventory.x).toBeGreaterThanOrEqual(0);
        expect(state.inventory.right).toBeLessThanOrEqual(viewport.width);
        expect(state.inventory.bottom).toBeLessThan(viewport.height / 2);
        expect(state.name.x).toBeGreaterThanOrEqual(state.button.x);
        expect(state.name.right).toBeLessThanOrEqual(state.button.right);
        for (const [selector, control] of Object.entries(state.controls)) {
          if (!control.visible) continue;
          const overlapX =
            Math.min(state.inventory.right, control.right) -
            Math.max(state.inventory.x, control.x);
          const overlapY =
            Math.min(state.inventory.bottom, control.bottom) -
            Math.max(state.inventory.y, control.y);
          expect(
            overlapX > 0 && overlapY > 0,
            `${device} ${weapon} inventory overlaps ${selector}`,
          ).toBe(false);
        }
        glyphs.add(state.glyph);
        colors.add(state.color);
      }
      report.cases.push({ device, weapon, ...state });
      if (weapon === "MISSILE" || weapon === "SHIELD" || weapon === null) {
        await page.screenshot({
          path: `test-artifacts/hud-${device}-${weapon || "empty"}.png`,
        });
      }
      if (weapon === "PULSE") {
        await page
          .locator("#weapon")
          .evaluate((el) => (el.style.filter = "grayscale(1)"));
        await page
          .locator("#weapon")
          .screenshot({ path: `test-artifacts/hud-${device}-grayscale.png` });
        await page.locator("#weapon").evaluate((el) => (el.style.filter = ""));
      }
    }
    expect(glyphs.size).toBe(5);
    expect(colors.size).toBe(5);
    await context.close();
  }
  expect(report.errors).toEqual([]);
  console.log(
    "HUD: all five inventories + empty/re-empty, production DOM/CSS, top placement/non-overlap and plain FIRE passed at 1440×900, 844×390 and 390×844.",
  );
} finally {
  await writeFile(
    "test-artifacts/hud-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
