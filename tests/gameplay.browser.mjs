import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { makeTrack } from "../src/track.js";

// Real browser input only: telemetry is read, never assigned; Race.update is never called.
const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const stage = process.env.GAMEPLAY_STAGE || "all";
const captureDuringLap = process.env.GAMEPLAY_CAPTURE_DURING_LAP === "1";
const track = makeTrack(0);
const jump = track.config.jump;
const [splitStart, splitEnd] = track.config.split;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const report = {
  url,
  trackLength: track.length,
  jump,
  split: track.config.split,
  method:
    "Playwright keyboard / CDP touch; read-only telemetry; no simulation hooks",
  errors,
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const held = new Set();
async function keys(page, wanted) {
  const next = new Set(wanted);
  for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
  for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
  held.clear();
  for (const key of next) held.add(key);
}
async function open(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#quality").check();
  await page.locator('[data-step="track"]').click();
  await page.locator("#tracks button").first().click();
  await page.locator('[data-step="class"]').click();
  return page;
}
async function start(page) {
  await page.locator('[data-step="craft"]').click();
  await page.locator("#start").click();
  await keys(page, ["ArrowUp"]);
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.05,
    {},
    { timeout: 45000 },
  );
}
async function telemetry(page) {
  return page.evaluate(() => window.nullVector.telemetry);
}
async function picture(page, name) {
  // Capture the real race, with no DOM hiding or injected camera/simulation hooks.
  await page.screenshot({ path: `test-artifacts/gameplay-${name}.png` });
}
async function passive() {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
  });
  const page = await open(context);
  await start(page);
  const samples = [];
  const began = performance.now();
  while (performance.now() - began < 150000) {
    const t = await telemetry(page);
    samples.push(t);
    if (t.time > 20) break;
    await sleep(100);
  }
  await keys(page, []);
  await picture(page, "passive-wall");
  const first = samples[0],
    last = samples.at(-1);
  report.passive = {
    simulatedSeconds: last.time,
    progress: last.progress,
    yawChange: wrap(last.yaw - first.yaw),
    minShield: Math.min(...samples.map((t) => t.shield)),
    maxSpeed: Math.max(...samples.map((t) => t.speed)),
    finalSpeed: last.speed,
    samples: samples.length,
    penalties: samples.filter(
      (t, i) => i && t.shield < samples[i - 1].shield - 0.01,
    ).length,
  };
  await writeFile(
    "test-artifacts/gameplay-passive.json",
    JSON.stringify(samples),
  );
  console.log("PASSIVE", JSON.stringify(report.passive));
  await context.close();
}
async function skilled() {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
  });
  const page = await open(context);
  await start(page);
  const samples = [],
    transitions = [],
    discontinuities = [];
  const screenshots = new Set();
  const began = performance.now();
  let last = null;
  let previousKey = null;
  while (performance.now() - began < 420000) {
    const t = await telemetry(page);
    const s = (t.lap - 1 + t.progress) * track.length;
    const branch =
      t.branch ||
      (t.progress > splitStart - 0.04 && t.progress < splitEnd + 0.02 ? -1 : 0);
    const look = track.frame(s + Math.max(14, t.speed * 0.48), branch);
    const desiredYaw = Math.atan2(
      look.p.x - t.worldPosition[0],
      look.p.z - t.worldPosition[2],
    );
    const error = wrap(desiredYaw - t.yaw);
    const demand = error * 2.8 - t.yawRate * 0.32;
    const direction =
      demand > 0.055 ? "ArrowLeft" : demand < -0.055 ? "ArrowRight" : null;
    const curve = Math.max(
      ...[0.25, 0.6, 0.95].map((ahead) =>
        Math.abs(track.curvature(s + t.speed * ahead, branch)),
      ),
    );
    const targetSpeed = Math.min(150, Math.sqrt(80 / Math.max(curve, 0.0001)));
    const input = [];
    if (t.speed <= targetSpeed + 4 && Math.abs(error) <= 0.7)
      input.push("ArrowUp");
    if (direction) input.push(direction);
    if (Math.abs(error) > 0.38) input.push(error > 0 ? "KeyJ" : "KeyL");
    await keys(page, input);
    samples.push({
      ...t,
      controller: { error, demand, direction, targetSpeed },
    });
    if (last) {
      const dt = t.time - last.time;
      const distance = Math.hypot(
        ...t.worldPosition.map((n, i) => n - last.worldPosition[i]),
      );
      if (dt > 0 && distance > Math.max(last.speed, t.speed) * dt + 5)
        discontinuities.push({
          time: t.time,
          dt,
          distance,
          from: last.worldPosition,
          to: t.worldPosition,
        });
      if (last.grounded !== t.grounded)
        transitions.push({
          time: t.time,
          progress: t.progress,
          grounded: t.grounded,
          height: t.height,
          speed: t.speed,
          shield: t.shield,
        });
    }
    last = t;
    previousKey = direction;
    if (captureDuringLap && t.progress > 0.07 && !screenshots.has("coast")) {
      screenshots.add("coast");
      await picture(page, "desktop-coast");
    }
    if (
      captureDuringLap &&
      t.progress > 0.33 &&
      t.progress < 0.42 &&
      !screenshots.has("split")
    ) {
      screenshots.add("split");
      await picture(page, "desktop-split");
    }
    if (
      captureDuringLap &&
      !t.grounded &&
      t.progress > jump - 0.005 &&
      t.progress < jump + 0.04 &&
      !screenshots.has("jump")
    ) {
      screenshots.add("jump");
      await picture(page, "desktop-jump");
    }
    if (t.lap >= 2 || t.time > 150) break;
    if (samples.length % 80 === 0)
      console.log(
        "DRIVING",
        JSON.stringify({
          time: t.time,
          progress: t.progress,
          speed: t.speed,
          shield: t.shield,
          branch: t.branch,
          error,
          previousKey,
        }),
      );
    await sleep(65);
  }
  await keys(page, []);
  await picture(page, "desktop-final");
  const final = samples.at(-1);
  const banked = (sign) =>
    samples.filter(
      (t) =>
        Math.sign(t.yawRate) === sign &&
        Math.abs(t.yawRate) > 0.12 &&
        t.speed > 20,
    );
  report.skilled = {
    completedLap: final.lap >= 2,
    simulatedSeconds: final.time,
    wallSeconds: (performance.now() - began) / 1000,
    finalProgress: final.progress,
    lap: final.lap,
    minShield: Math.min(...samples.map((t) => t.shield)),
    minBranch: Math.min(...samples.map((t) => t.branch)),
    maxBranch: Math.max(...samples.map((t) => t.branch)),
    maxHeight: Math.max(...samples.map((t) => t.height)),
    maxSpeed: Math.max(...samples.map((t) => t.speed)),
    maxSampleGap: Math.max(
      ...samples.slice(1).map((t, i) => t.time - samples[i].time),
    ),
    rescueCandidates: samples
      .slice(1)
      .filter((t, i) => t.shield < samples[i].shield - 22 && t.speed < 6)
      .length,
    maxMotionResidual: Math.max(
      ...samples.slice(1).map((t, i) => {
        const before = samples[i],
          dt = t.time - before.time;
        return Math.hypot(
          ...t.worldPosition.map(
            (n, axis) =>
              n -
              before.worldPosition[axis] -
              (t.velocity[axis] + before.velocity[axis]) * 0.5 * dt,
          ),
        );
      }),
    ),
    transitions,
    cleanJump: transitions.some(
      (t, i) =>
        !t.grounded &&
        t.progress >= jump - 0.01 &&
        t.progress < jump + 0.03 &&
        transitions
          .slice(i + 1)
          .some(
            (land) =>
              land.grounded &&
              land.progress > jump + 0.014 &&
              land.progress < jump + 0.1 &&
              land.speed > 40 &&
              land.shield >= t.shield - 2,
          ),
    ),
    discontinuities,
    banking: [-1, 1].map((sign) => ({
      yawSign: sign,
      samples: banked(sign).length,
      inward: banked(sign).filter((t) => t.roll * t.yawRate < 0).length,
    })),
    samples: samples.length,
  };
  await writeFile(
    "test-artifacts/gameplay-skilled.json",
    JSON.stringify(samples),
  );
  console.log("SKILLED", JSON.stringify(report.skilled));
  await context.close();
}
async function mobile() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await open(context);
  await start(page);
  await keys(page, []);
  const cdp = await context.newCDPSession(page);
  const samples = [];
  const began = performance.now();
  let touching = false;
  const pad = await page.locator("#steer-pad").boundingBox();
  while (performance.now() - began < 90000) {
    const t = await telemetry(page);
    const look = track.frame(
      t.progress * track.length + Math.max(14, t.speed * 0.48),
    );
    const error = wrap(
      Math.atan2(look.p.x - t.worldPosition[0], look.p.z - t.worldPosition[2]) -
        t.yaw,
    );
    const steer = Math.max(-1, Math.min(1, -(error * 2.5 - t.yawRate * 0.25)));
    await cdp.send("Input.dispatchTouchEvent", {
      type: touching ? "touchMove" : "touchStart",
      touchPoints: [
        {
          id: 1,
          x: pad.x + pad.width * (0.5 + steer * 0.38),
          y: pad.y + pad.height * 0.5,
        },
      ],
    });
    touching = true;
    samples.push(t);
    if (t.time > 12) break;
    await sleep(80);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await picture(page, "mobile-touch");
  report.mobile = {
    seconds: samples.at(-1).time,
    progress: samples.at(-1).progress,
    minShield: Math.min(...samples.map((t) => t.shield)),
    samples: samples.length,
  };
  await writeFile(
    "test-artifacts/gameplay-mobile.json",
    JSON.stringify(samples),
  );
  console.log("MOBILE", JSON.stringify(report.mobile));
  await context.close();
}
try {
  if (stage === "all" || stage === "passive") await passive();
  if (stage === "all" || stage === "skilled") await skilled();
  if (stage === "all" || stage === "mobile") await mobile();
} finally {
  await writeFile(
    `test-artifacts/gameplay-report-${stage}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
