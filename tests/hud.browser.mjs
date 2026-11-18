import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Production DOM/CSS and inventory function; application-input coverage lives
// in input-chords. No application or renderer runs in this layout fixture.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
await mkdir("test-artifacts", { recursive: true });
const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace(
    "</head>",
    ["style", "console-menu", "race-hud"]
      .map((sheet) => `<link rel="stylesheet" href="/src/${sheet}.css">`)
      .join("") + "</head>",
  );
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const report = { url, cases: [], errors: [] };
try {
  for (const [device, viewport, touch] of [
    ["desktop", { width: 1440, height: 900 }, false],
    ["landscape", { width: 844, height: 390 }, true],
    ["portrait", { width: 390, height: 844 }, true],
    ["compact", { width: 320, height: 568 }, true],
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
      document.body.dataset.inputMode = touch ? "touch" : "keyboard";
      const { createWeaponHUD } = await import("/src/weapon-ui.ts");
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
    const active = touch ? "#touch-fire" : "#weapon";
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
      const fire = page.locator("#touch-fire");
      await expect(fire).toHaveText(weapon || "EMPTY");
      await expect(fire).toHaveAttribute(
        "aria-label",
        weapon ? `Fire ${weapon}` : "No weapon equipped",
      );
      if (touch)
        await expect(fire).toHaveAccessibleName(
          weapon ? `Fire ${weapon}` : "No weapon equipped",
        );
      if (weapon) await expect(fire).toBeEnabled();
      else await expect(fire).toBeDisabled();
      await expect(page.locator("#weapon .weapon-action")).toHaveCount(0);
      if (touch) {
        await expect(page.locator("#weapon")).toBeHidden();
        await expect(fire).toBeVisible();
        expect(
          await fire.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        ).toBe(true);
      } else {
        await expect(fire).toBeHidden();
      }
      if (weapon) {
        await expect(page.locator("#weapon")).toHaveText(weapon);
        await expect(page.locator("#weapon")).toHaveAttribute(
          "aria-label",
          `Fire ${weapon}`,
        );
        if (!touch)
          await expect(page.locator("#weapon")).toHaveAccessibleName(
            `Fire ${weapon}`,
          );
        await expect(page.locator(active)).toBeVisible();
        await expect(page.locator(`${active} .weapon-name`)).toHaveText(weapon);
        await expect(page.locator(`${active} svg`)).toHaveCount(1);
        const state = await page.locator(active).evaluate((button) => {
          const rect = (element) => {
            const r = element.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          };
          const name = button.querySelector(".weapon-name");
          const controls = [
            "#position",
            "#lap",
            "#lap-times",
            "#hud-track",
            "#timer",
            "#view",
            "#pause",
            "#steer-pad",
            "#air-pad",
            ".velocity",
            ".shield",
          ];
          return {
            button: rect(button),
            name: rect(name),
            overflow: name.scrollWidth > name.clientWidth,
            glyph: button.querySelector("svg").innerHTML,
            color: button.style.getPropertyValue("--weapon-color"),
            controls: Object.fromEntries(
              controls.map((selector) => {
                const el = document.querySelector(selector);
                return [
                  selector,
                  { visible: !!el.getClientRects().length, ...rect(el) },
                ];
              }),
            ),
          };
        });
        expect(state.overflow).toBe(false);
        expect(state.button.width).toBeGreaterThan(0);
        expect(state.button.height).toBeGreaterThan(0);
        expect(state.button.x).toBeGreaterThanOrEqual(0);
        expect(state.button.y).toBeGreaterThanOrEqual(0);
        expect(state.button.right).toBeLessThanOrEqual(viewport.width);
        expect(state.button.bottom).toBeLessThanOrEqual(viewport.height);
        if (!touch)
          expect(state.button.bottom).toBeLessThan(viewport.height / 2);
        expect(state.name.x).toBeGreaterThanOrEqual(state.button.x);
        expect(state.name.right).toBeLessThanOrEqual(state.button.right);
        for (const [selector, control] of Object.entries(state.controls)) {
          if (!control.visible) continue;
          const overlapX =
            Math.min(state.button.right, control.right) -
            Math.max(state.button.x, control.x);
          const overlapY =
            Math.min(state.button.bottom, control.bottom) -
            Math.max(state.button.y, control.y);
          expect(
            overlapX > 0 && overlapY > 0,
            `${device} ${weapon} overlaps ${selector}`,
          ).toBe(false);
        }
        glyphs.add(state.glyph);
        colors.add(state.color);
        report.cases.push({ device, weapon, ...state });
      } else {
        await expect(page.locator("#weapon")).toBeHidden();
        await expect(page.locator("#weapon")).toHaveText("");
        await expect(fire.locator("svg, .weapon-name")).toHaveCount(0);
      }
      await page.screenshot({
        path: `test-artifacts/hud-${device}-${weapon || "empty"}.png`,
      });
      if (weapon === "PULSE") {
        await page
          .locator(active)
          .evaluate((el) => (el.style.filter = "grayscale(1)"));
        await page
          .locator(active)
          .screenshot({ path: `test-artifacts/hud-${device}-grayscale.png` });
        await page.locator(active).evaluate((el) => (el.style.filter = ""));
        if (touch) {
          // Input-mode changes do not require a new pickup to restore the HUD.
          for (const mode of ["gamepad", "keyboard", "touch"]) {
            await page.evaluate(
              (mode) => (document.body.dataset.inputMode = mode),
              mode,
            );
            if (mode === "touch") {
              await expect(page.locator("#weapon")).toBeHidden();
              await expect(fire).toBeVisible();
            } else {
              await expect(page.locator("#weapon")).toBeVisible();
              await expect(fire).toBeHidden();
            }
          }
        }
      }
    }
    expect(glyphs.size).toBe(5);
    expect(colors.size).toBe(5);
    await page.evaluate(() =>
      document.querySelector("#pause-panel").showModal(),
    );
    await expect(page.locator("#pause-title")).toHaveText("PAUSED");
    await expect(page.locator("#pause-panel .eyebrow")).toHaveCount(0);
    await expect(page.locator("#resume")).toBeVisible();
    await page.screenshot({ path: `test-artifacts/pause-${device}.png` });
    await context.close();
  }
  expect(report.errors).toEqual([]);
  console.log(
    "HUD: five weapons, empty/re-empty, input-mode switching, bounds/non-overlap and pause menu passed on desktop, landscape, portrait and compact mobile.",
  );
} finally {
  await writeFile(
    "test-artifacts/hud-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
