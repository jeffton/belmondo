import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

// Production main-loop integration fixture, not a driving/physics test.
// Contact progress is held fixed to check representative tunnel/open-road positions.
const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body:
        source +
        `\nwindow.musicFixture = {
      get player() { return music; },
      setContact(u, grounded = true) {
        race.update = () => {
          race.player.contactS = track.length * u;
          race.player.grounded = grounded;
        };
      }
    };`,
    });
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.musicFixture && window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#quality").check();
  const results = [];
  for (const [index, inside] of [
    [0, 0.15],
    [1, 0.24],
    [2, 0.48],
  ]) {
    await page.locator(`#tracks button[data-index="${index}"]`).click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => musicFixture.player.audio.currentTime > 0.1,
    );
    for (const [u, grounded, expected] of [
      [inside, true, index !== 0],
      [inside, false, false],
      [0.7, true, false],
    ]) {
      await page.evaluate(
        ({ u, grounded }) => musicFixture.setContact(u, grounded),
        { u, grounded },
      );
      await page.waitForFunction(
        (expected) => musicFixture.player.inTunnel === expected,
        expected,
      );
      await page.waitForFunction(
        (expected) =>
          Math.abs(musicFixture.player.wet.gain.value - (expected ? 0.11 : 0)) <
          0.0001,
        expected,
      );
      results.push({
        index,
        u,
        grounded,
        wet: await page.evaluate(() => musicFixture.player.wet.gain.value),
      });
    }
    await page.evaluate((u) => musicFixture.setContact(u), inside);
    await page.waitForFunction(
      (expected) => musicFixture.player.inTunnel === expected,
      index !== 0,
    );
    await page.locator("#pause").click();
    await page.waitForFunction(
      () => musicFixture.player.output.gain.value === 0,
    );
    await page.locator("#quit").click();
    assert.equal(
      await page.evaluate(() => musicFixture.player.inTunnel),
      false,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        method: "Production game + fixed-contact integration fixture",
        cases: results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
