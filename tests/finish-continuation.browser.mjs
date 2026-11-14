import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";

// Test-only near-finish fixtures in the real app module. No shipped hooks,
// mocked renderer, mocked Race, or direct calls to showResults/returnToPaddock.
// RAF runs actual swept crossing, result rendering, cooldown and menu flow.
const mobile = process.env.FINISH_MOBILE === "1";
const speedClass = Number(process.env.FINISH_CLASS || 0);
const mode = process.env.FINISH_MODE || "race";
const exit = process.env.FINISH_EXIT || (mobile ? "touch" : "keyboard");
const eliminated = process.env.FINISH_ELIMINATED === "1";
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__testPad = null;
    navigator.getGamepads = () => [window.__testPad];
  });
  await page.route("**/src/main.js", async (route) => {
    const { code: body } = await server.transformRequest("/src/main.js");
    await route.fulfill({
      contentType: "text/javascript",
      body:
        body +
        `
      window.finishFixture = (eliminated) => {
        race.countdown = 0;
        race.time = 60;
        race.laps = Array.from({length: race.lapCount - 1}, () => 20);
        race.bestLap = 20;
        race.lapStart = (race.lapCount - 1) * 20;
        const approach = (r, distance) => {
          const s = track.finishS + race.lapCount * track.length - distance;
          const f = track.frame(s);
          r.s = r.contactS = s;
          r.lap = race.lapCount;
          r.gate = race.lapCount * 32;
          r.branch = 0;
          r.x = 0;
          r.position.copy(f.p); r.position.y += 2.2;
          r.speed = 100 * race.classSpec.pace;
          r.velocity.copy(f.tangent).multiplyScalar(r.speed);
          r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
          r.yawRate = r.pitchTrim = r.stun = 0;
          r.grounded = true;
          r.checkpoint = {s, branch: 0, gate: r.gate};
        };
        if (eliminated) race.eliminate(race.player);
        else approach(race.player, 12);
        if (race.racers[1]) approach(race.racers[1], 2);
      };
      window.finishSnapshot = () => ({
        complete: race.complete,
        position: race.resultPosition,
        time: race.resultTime,
        laps: [...race.laps],
        racers: race.racers.map(r => ({id: r.id, finished: r.finished, eliminated: r.eliminated, position: r.position.toArray(), speed: r.speed, result: [r.finishTime, r.finalPosition]})),
        selected: [selectedTrack, selectedCraft, race.speedClass, race.mode],
        persisted: [localStorage.getItem('nv-records'), localStorage.getItem('nv-progression')],
      });
    `,
    });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator(`input[name="mode"][value="${mode}"]`).check();
  await page.locator("#setup-next").click();
  await page
    .locator(`input[name="speed-class"][value="${speedClass}"]`)
    .check();
  await page.locator("#setup-next").click();
  await page.locator("#setup-next").click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await page.evaluate((value) => window.finishFixture(value), eliminated);
  await expect(page.locator("#results")).toBeVisible();
  const first = await page.evaluate(() => window.finishSnapshot());
  expect(first.position).toBe(
    eliminated ? (mode === "trial" ? 1 : 8) : mode === "trial" ? 1 : 2,
  );
  expect(first.complete).toBe(mode === "trial");
  const moved = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  await page.waitForFunction(
    ({ first, eliminated, mode }) => {
      const now = window.finishSnapshot();
      const id = eliminated && mode === "race" ? 1 : 0;
      if (eliminated && mode === "trial") return true;
      return (
        Math.hypot(
          ...now.racers[id].position.map(
            (v, i) => v - first.racers[id].position[i],
          ),
        ) > 25
      );
    },
    { first, eliminated, mode },
  );
  const later = await page.evaluate(() => window.finishSnapshot());
  expect(later.time).toBe(first.time);
  expect(later.laps).toEqual(first.laps);
  expect(later.position).toBe(first.position);
  expect(later.persisted).toEqual(first.persisted);
  if (eliminated)
    expect(later.racers[0].position).toEqual(first.racers[0].position);
  else
    expect(
      moved(later.racers[0].position, first.racers[0].position),
    ).toBeGreaterThan(25);
  await expect(
    page.locator("#result-data .result-line").first(),
  ).not.toContainText("LAPS");
  const marks = await page.locator(".result-mark").evaluateAll((nodes) =>
    nodes.map((mark) => {
      const time = mark.nextElementSibling;
      const a = mark.getBoundingClientRect(),
        b = time.getBoundingClientRect();
      return {
        label: mark.textContent,
        gap: b.left - a.right,
        sameLine: Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 2,
      };
    }),
  );
  for (const mark of marks) {
    expect(mark.gap).toBeGreaterThanOrEqual(0);
    expect(mark.gap).toBeLessThanOrEqual(8);
    expect(mark.sameLine).toBe(true);
  }
  await mkdir("/var/tmp/belmondo-finish-continuation", { recursive: true });
  await page.screenshot({
    path: `/var/tmp/belmondo-finish-continuation/${mobile ? "mobile" : "desktop"}-${mode}-c${speedClass}-${eliminated ? "dnf" : "finish"}.png`,
  });
  if (exit === "touch") await page.locator("#result-quit").tap();
  else if (exit === "controller") {
    await page.evaluate(() => {
      window.__testPad = {
        axes: [0, 0],
        buttons: Array.from({ length: 16 }, () => ({
          pressed: false,
          value: 0,
        })),
        connected: true,
        index: 0,
        mapping: "standard",
      };
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.__testPad.buttons[1] = { pressed: true, value: 1 };
    });
  } else await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      window.nullVector.telemetry.state === "menu" &&
      window.nullVector.telemetry.menuStage === "track",
  );
  const returned = await page.evaluate(() => window.finishSnapshot());
  expect(returned.selected).toEqual(first.selected);
  expect(returned.persisted).toEqual(first.persisted);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      mobile,
      speedClass,
      mode,
      eliminated,
      exit,
      complete: first.complete,
      resultPosition: first.position,
      marks,
      errors,
      returnedTo: "track",
      method:
        "real WebGL/RAF/Race from near-finish fixture; no full-race claim",
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
