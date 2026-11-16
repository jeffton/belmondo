import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";

// Test-only near-finish fixtures in the real app module. No shipped hooks,
// mocked renderer, mocked Race, or direct calls to showResults/returnToPaddock.
// RAF runs actual swept crossing, result rendering, cooldown and menu flow.
const viewport = JSON.parse(
  process.env.VIEWPORT || '{"width":1280,"height":800}',
);
const mobile = viewport.width < 900;
const place = Number(process.env.PODIUM_PLACE || 1);
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
    viewport,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion:
      process.env.REDUCED_MOTION === "1" ? "reduce" : "no-preference",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__testPad = null;
    navigator.getGamepads = () => [window.__testPad];
  });
  await page.route("**/src/main.ts", async (route) => {
    const { code: body } = await server.transformRequest("/src/main.ts");
    await route.fulfill({
      contentType: "text/javascript",
      body:
        body +
        `
      window.finishFixture = ({eliminated, place}) => {
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
        else approach(race.player, 24);
        for (let i = 1; i < place && race.racers[i]; i++) {
          approach(race.racers[i], i * 4);
          const r = race.racers[i];
          const f = track.frame(r.s);
          r.x = i % 2 ? 6 : -6;
          r.position.addScaledVector(f.right, r.x);
        }
      };
      window.podiumSnapshot = () => ({angle: podiumTrophy.angle, calls: podiumTrophy.renderer?.info.render.calls, triangles: podiumTrophy.renderer?.info.render.triangles, frames: podiumTrophy.renderer?.info.render.frame});
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
  await page.evaluate((value) => window.finishFixture(value), {
    eliminated,
    place,
  });
  await expect(page.locator("#results")).toBeVisible();
  const first = await page.evaluate(() => window.finishSnapshot());
  expect(first.position).toBe(
    eliminated ? (mode === "trial" ? 1 : 8) : mode === "trial" ? 1 : place,
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
  const podium = mode === "race" && !eliminated && place <= 3;
  const trophy = page.locator(".podium-trophy");
  await expect(page.locator("#results .eyebrow")).toHaveCount(0);
  if (podium) {
    await expect(trophy).toBeVisible();
    const alignment = await page.evaluate(() => {
      const title = document
        .querySelector("#result-title")
        .getBoundingClientRect();
      const cup = document
        .querySelector("#results .podium-trophy")
        .getBoundingClientRect();
      return Math.abs(title.top + title.height / 2 - cup.top - cup.height / 2);
    });
    expect(alignment).toBeLessThanOrEqual(1);
    await expect(trophy).toHaveAttribute("data-place", String(place));
    await expect(trophy.locator("canvas")).toBeVisible();
    const rendered = await page.evaluate(() => window.podiumSnapshot());
    expect(rendered.calls).toBe(1);
    expect(rendered.triangles).toBeLessThan(500);
    await page.waitForFunction(
      (frames) => window.podiumSnapshot().frames > frames + 2,
      rendered.frames,
    );
    const animated = await page.evaluate(() => window.podiumSnapshot());
    if (process.env.REDUCED_MOTION === "1")
      expect(animated.angle).toBe(rendered.angle);
    else expect(animated.angle).toBeGreaterThan(rendered.angle);

    await expect(trophy).toHaveAttribute(
      "aria-label",
      new RegExp(["Gold", "Silver", "Bronze"][place - 1]),
    );
  } else await expect(trophy).toBeHidden();
  await mkdir("test-artifacts/podium", { recursive: true });
  const capture = async (stage) => {
    if (podium) {
      const bounds = await trophy.evaluate((el) => {
        const a = el.getBoundingClientRect();
        const overlaps = [
          ...document.querySelectorAll(
            "#results h2, #result-data, #results button, #menu button, #menu .choice, #model-name, #model-subtitle, #craft-stats",
          ),
        ]
          .filter((e) => e.getClientRects().length && !e.hidden)
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return (
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top
            );
          })
          .map((e) => e.id || e.className);
        return {
          inside:
            a.left >= 0 &&
            a.right <= innerWidth &&
            a.top >= 0 &&
            a.bottom <= innerHeight,
          overlaps,
        };
      });
      expect(bounds).toEqual({ inside: true, overlaps: [] });
    }
    await page.screenshot({
      path: `test-artifacts/podium/${viewport.width}x${viewport.height}-${mode}-${eliminated ? "dnf" : place}-${stage}.png`,
    });
  };
  await capture("results");
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
    await page.waitForFunction(
      () => document.body.dataset.gamepadConnected === "true",
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    // Select Return to paddock, then confirm; B is deliberately inert.
    await page.evaluate(() => {
      window.__testPad.buttons[13] = { pressed: true, value: 1 };
    });
    await expect(page.locator("#result-quit")).toHaveClass(/menu-cursor/);
    await page.evaluate(() => {
      window.__testPad.buttons[13] = { pressed: false, value: 0 };
      window.__testPad.buttons[0] = { pressed: true, value: 1 };
    });
  } else {
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#result-quit")).toHaveClass(/menu-cursor/);
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(
    () =>
      window.nullVector.telemetry.state === "menu" &&
      window.nullVector.telemetry.menuStage === "track",
  );
  const returned = await page.evaluate(() => window.finishSnapshot());
  expect(returned.selected).toEqual(first.selected);
  expect(returned.persisted).toEqual(first.persisted);
  if (podium) {
    await expect(trophy).toBeVisible();
    await expect(trophy).toHaveAttribute("data-place", String(place));
    await capture("menu");
    // Stage changes and an unrelated format selection cannot invent a new result.
    await page.locator("#setup-back").click();
    await page.locator("#setup-back").click();
    await page.locator('input[name="mode"][value="trial"]').check();
    await expect(trophy).toHaveAttribute("data-place", String(place));
    await page.locator("#setup-next").click();
    await page.locator("#setup-next").click();
    await page.locator("#setup-next").click();
    await page.locator("#start").click();
    await expect(trophy).toBeHidden();
    const hidden = await page.evaluate(() => window.podiumSnapshot());
    await page.evaluate(() =>
      window.finishFixture({ eliminated: false, place: 1 }),
    );
    await expect(page.locator("#results")).toBeVisible();
    await expect(trophy).toBeHidden();
    expect((await page.evaluate(() => window.podiumSnapshot())).frames).toBe(
      hidden.frames,
    );
    await page.reload();
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    await expect(trophy).toBeHidden();
  } else await expect(trophy).toBeHidden();
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
