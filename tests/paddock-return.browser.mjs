import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

// Run each shard under 60 seconds:
// PADDOCK_INPUT=keyboard|gamepad|pointer|touch node tests/paddock-return.browser.mjs
// Real WebGL, navigation, audio, Race and persistence. Only the end-of-race
// fixture and observation wrappers are injected into the served module.
const input = process.env.PADDOCK_INPUT || "keyboard";
if (!["keyboard", "gamepad", "pointer", "touch"].includes(input))
  throw new Error(`Unknown PADDOCK_INPUT: ${input}`);
const mobile = input === "touch";
const testAccess = input === "gamepad";
const mode = testAccess || mobile ? "trial" : "race";
const speedClass = testAccess ? 2 : mobile ? 1 : 0;
const trackIndex = testAccess ? 6 : 1;
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.paddockPad = {
      index: 0,
      id: "Paddock regression standard controller",
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.paddockPad],
    });
  });
  await page.route("**/src/main.ts", async (route) => {
    const { code } = await server.transformRequest("/src/main.ts");
    await route.fulfill({
      contentType: "text/javascript",
      body: `${code}
        window.paddockQA = {
          cues: [],
          finish() {
            race.player.finished = true;
            race.player.finishTime = 12;
            race.resultTime = 12;
            Object.defineProperty(race, 'position', {value: 1, configurable: true});
            race.laps = Array.from({length: race.lapCount}, () => 12 / race.lapCount);
            race.bestLap = race.laps[0];
            showResults();
          },
          selection: () => ({
            mode: selectedMode(), speedClass: selectedSpeedClass,
            track: selectedTrack, craft: selectedCraft,
            testAccess: circuitTestAccess.enabled,
          }),
          render: () => ({calls: world.renderer.info.render.calls,
            triangles: world.renderer.info.render.triangles}),
        };
        const originalMenuCue = sound.menuCue.bind(sound);
        sound.menuCue = (kind) => {
          window.paddockQA.cues.push(kind);
          return originalMenuCue(kind);
        };
      `,
    });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.paddockQA);
  const tap = async (selector) => {
    if (mobile) await page.locator(selector).tap();
    else await page.locator(selector).click();
  };
  const pad = async (index, held) => {
    await page.evaluate(
      ({ index, held }) => {
        Object.assign(window.paddockPad.buttons[index], {
          pressed: held,
          touched: held,
          value: Number(held),
        });
      },
      { index, held },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  };
  const pressPad = async (index) => {
    await pad(index, true);
    await pad(index, false);
  };
  const persisted = () =>
    page.evaluate(() =>
      ["nv-records", "nv-progression", "nv-test-access"].map((key) =>
        localStorage.getItem(key),
      ),
    );
  const selection = () => page.evaluate(() => window.paddockQA.selection());
  const clearCues = () =>
    page.evaluate(() => {
      window.paddockQA.cues = [];
    });
  const cues = () => page.evaluate(() => window.paddockQA.cues);
  const hints = async (root, expected) => {
    const visible = await page
      .locator(`${root} [data-gamepad-hint]`)
      .evaluateAll((buttons) =>
        buttons
          .map((button) => ({
            selected: button.classList.contains("menu-cursor"),
            content: getComputedStyle(button, "::before").content,
            display: getComputedStyle(button, "::before").display,
          }))
          .filter((hint) => hint.display !== "none"),
      );
    if (expected === null) expect(visible).toEqual([]);
    else {
      expect(visible).toHaveLength(1);
      expect(visible[0].selected).toBe(true);
      expect(visible[0].content).toBe(JSON.stringify(expected));
    }
  };
  const selectReturn = async (selector) => {
    for (let i = 0; i < 5; i++) {
      if (
        await page
          .locator(selector)
          .evaluate((element) => element.classList.contains("menu-cursor"))
      )
        break;
      if (input === "gamepad") await pressPad(13);
      else await page.keyboard.press("ArrowDown");
    }
    await expect(page.locator(selector)).toHaveClass(/menu-cursor/);
    // The final item stays selected at the lower edge; the real input also
    // establishes the modality when a preceding inert B press used gamepad.
    if (input === "gamepad") await pressPad(13);
    else await page.keyboard.press("ArrowDown");
    await expect(page.locator(selector)).toHaveClass(/menu-cursor/);
  };
  const activateReturn = async (selector, root) => {
    if (input === "keyboard" || input === "gamepad") {
      await selectReturn(selector);
      await hints(root, input === "gamepad" ? "Ⓐ" : "ENTER");
      await clearCues();
      if (input === "gamepad") await pressPad(0);
      else await page.keyboard.press("Enter");
    } else {
      await clearCues();
      await tap(selector);
    }
    await page.waitForFunction(
      () =>
        window.nullVector.telemetry.state === "menu" &&
        window.nullVector.telemetry.menuStage === "track",
    );
    expect(await cues()).toEqual(["confirm"]);
    const circuit = page.locator(`#tracks button:nth-child(${trackIndex + 1})`);
    await expect(circuit).toHaveAttribute("aria-pressed", "true");
    await expect(circuit).toHaveClass(/menu-cursor/);
    await expect(circuit).toBeFocused();
  };
  const startFromTrack = async () => {
    await tap("#setup-next");
    await tap("#start");
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    await page.waitForFunction(() => window.paddockQA.render().triangles > 0);
    const rendered = await page.evaluate(() => window.paddockQA.render());
    expect(rendered.calls).toBeGreaterThan(0);
  };
  if (testAccess) for (let i = 0; i < 5; i++) await tap(".wordmark");
  await page.locator(`input[name="mode"][value="${mode}"]`).check();
  await tap("#setup-next");
  await page
    .locator(`input[name="speed-class"][value="${speedClass}"]`)
    .check();
  await tap("#setup-next");
  await tap(`#tracks button:nth-child(${trackIndex + 1})`);
  const selected = await selection();
  expect(selected).toMatchObject({
    mode,
    speedClass,
    track: trackIndex,
    testAccess,
  });
  await startFromTrack();
  const beforePause = await persisted();

  // Escape resumes an actual pause; B must not dismiss it or return to menus.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await pressPad(1);
  expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeHidden();
  expect(await page.evaluate(() => window.nullVector.telemetry.state)).toBe(
    "race",
  );
  expect(await page.evaluate(() => window.nullVector.telemetry.paused)).toBe(
    false,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await activateReturn("#quit", "#pause-panel");
  expect(await selection()).toEqual(selected);
  expect(await persisted()).toEqual(beforePause);
  await expect(
    page.locator(`#tracks button:nth-child(${trackIndex + 1})`),
  ).toHaveClass(/active/);

  await startFromTrack();
  await page.evaluate(() => window.paddockQA.finish());
  await expect(page.locator("#results")).toBeVisible();
  const afterFinish = await persisted();
  if (mode === "race" && !testAccess) {
    expect(afterFinish[0]).not.toBeNull();
    expect(afterFinish[1]).not.toBeNull();
    expect(afterFinish).not.toEqual(beforePause);
  } else if (testAccess) expect(afterFinish).toEqual(beforePause);

  // Both backing out and controller Start are inert before explicit selection.
  await clearCues();
  await page.keyboard.press("Escape");
  await pressPad(1);
  await pressPad(9);
  await expect(page.locator("#results")).toBeVisible();
  expect(await page.evaluate(() => window.nullVector.telemetry.state)).toBe(
    "results",
  );
  expect(await cues()).toEqual([]);
  expect(await persisted()).toEqual(afterFinish);
  if (mobile) {
    // A genuine touch outside either action changes modality, not screen.
    await page.locator("#result-title").tap();
    await hints("#results", null);
  } else {
    await page.keyboard.press("ArrowUp");
    await hints("#results", "ENTER");
    await expect(page.locator("#again")).toHaveClass(/menu-cursor/);
  }
  if (input === "keyboard" || input === "gamepad") {
    await selectReturn("#result-quit");
    await clearCues();
    await page.keyboard.press("Escape");
    await pressPad(1);
    await expect(page.locator("#result-quit")).toHaveClass(/menu-cursor/);
    expect(await page.evaluate(() => window.nullVector.telemetry.state)).toBe(
      "results",
    );
    expect(await cues()).toEqual([]);
    expect(await persisted()).toEqual(afterFinish);
  }
  await activateReturn("#result-quit", "#results");
  expect(await selection()).toEqual(selected);
  expect(await persisted()).toEqual(afterFinish);
  await expect(page.locator("#results")).toBeHidden();
  await expect(
    page.locator(`#tracks button:nth-child(${trackIndex + 1})`),
  ).toHaveClass(/active/);
  expect(errors).toEqual([]);
  console.log(
    `Paddock return PASS: ${input}, ${mode}, class ${speedClass}, track ${trackIndex}, test access ${testAccess}`,
  );
} finally {
  await browser.close();
  await server.close();
}
