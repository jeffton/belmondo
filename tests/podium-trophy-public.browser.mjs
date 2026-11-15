import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Exercise the deployed bundle with a test-only near-finish Race fixture.
// No source rebuild, mocked renderer, direct result calls or shipped test hooks.
const url = process.env.GAME_URL || "https://belmondo.roybot.se/";
const viewport = JSON.parse(
  process.env.VIEWPORT || '{"width":1280,"height":800}',
);
const place = Number(process.env.PODIUM_PLACE || 1);
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport,
    hasTouch: viewport.width < 900,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/index-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const telemetry = body.slice(body.indexOf("window.nullVector="));
    const race = telemetry.match(/time:([\w$]+)\.time,position:/)[1];
    const track = telemetry.match(/finishS:([\w$]+)\.finishS/)[1];
    await route.fulfill({
      response,
      body:
        body +
        `
      window.podiumFinishFixture = (place) => {
        const race = ${race}, track = ${track};
        race.countdown = 0; race.time = 60;
        race.laps = Array(race.lapCount - 1).fill(20);
        race.bestLap = 20; race.lapStart = 60;
        const approach = (r, distance) => {
          const s = track.finishS + race.lapCount * track.length - distance;
          const f = track.frame(s);
          r.s = r.contactS = s; r.lap = race.lapCount;
          r.gate = race.lapCount * 32; r.branch = 0; r.x = 0;
          r.position.copy(f.p); r.position.y += 2.2;
          r.speed = 100 * race.classSpec.pace;
          r.velocity.copy(f.tangent).multiplyScalar(r.speed);
          r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
          r.yawRate = r.pitchTrim = r.stun = 0; r.grounded = true;
          r.checkpoint = {s, branch: 0, gate: r.gate};
        };
        approach(race.player, 24);
        for (let i = 1; i < place; i++) {
          const r = race.racers[i]; approach(r, i * 4);
          r.x = i % 2 ? 6 : -6;
          r.position.addScaledVector(track.frame(r.s).right, r.x);
        }
      };`,
    });
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  for (let i = 0; i < 3; i++) await page.locator("#setup-next").click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await page.evaluate((place) => window.podiumFinishFixture(place), place);
  await expect(page.locator("#results")).toBeVisible();
  const trophy = page.locator(".podium-trophy");
  if (place <= 3) {
    await expect(trophy).toBeVisible();
    await expect(trophy).toHaveAttribute("data-place", String(place));
    await expect(trophy.locator("canvas")).toBeVisible();
  } else await expect(trophy).toBeHidden();
  await mkdir("test-artifacts/podium", { recursive: true });
  await page.screenshot({
    path: `test-artifacts/podium/public-${viewport.width}x${viewport.height}-${place}-results.png`,
  });
  await page.locator("#result-quit").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
  if (place <= 3) await expect(trophy).toBeVisible();
  else await expect(trophy).toBeHidden();
  await page.screenshot({
    path: `test-artifacts/podium/public-${viewport.width}x${viewport.height}-${place}-menu.png`,
  });
  expect(errors).toEqual([]);
  console.log(
    `PASS public deployed WebGL fixture: #${place}, ${viewport.width}x${viewport.height}, result + paddock; no JS errors`,
  );
} finally {
  await browser.close();
}
