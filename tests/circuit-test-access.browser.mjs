import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-software-rasterizer"],
});
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
    });
    await page.route("**/src/world.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
      import { PerspectiveCamera, Vector3 } from '/node_modules/.vite/deps/three.js';
      export class World {
        environment = { terrain: undefined }; view = 'chase';
        renderer = { info: { memory: {}, render: {} } }; camera = new PerspectiveCamera(); ships = [];
        resize() {} setupRacers(race) { this.ships = race.racers.map(() => ({ position: new Vector3(), rotation: {z:0} })); }
        async prepare(track, prepared, current, setup) { const candidate = new World(); setup(candidate); return current() ? candidate : null; }
        adopt(candidate) { Object.assign(this, candidate); }
      }`,
      }),
    );
    await page.route("**/src/course-preparation.js*", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export class CoursePreparation { async load() { return { workerMs: 0 }; } }",
      }),
    );
    for (const [file, name] of [
      ["audio", "AudioEngine"],
      ["music", "MusicPlayer"],
    ]) {
      await page.route(`**/src/${file}.js`, (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export class ${name} { constructor() { return new Proxy({audio:{paused:true}}, {get:(o,k)=>k in o?o[k]:(()=>{})}); } }`,
        }),
      );
    }
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}
        window.testCircuitQA = {
          select: selectTrack,
          selected: () => selectedTrack,
          start: () => start({ currentTarget: document.querySelector('#start') }),
          result: () => { race.player.finished = true; race.player.finishTime = 12; race.resultTime = 12; Object.defineProperty(race, 'position', {value:1}); race.laps = [4,4,4]; race.bestLap = 4; showResults(); },
          return: returnToPaddock,
          access: () => circuitTestAccess.enabled,
          snapshot: () => race.testAccess
        };`,
      });
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.testCircuitQA);
    await expect(page.locator("#tracks button:disabled")).toHaveCount(4);
    await page.evaluate(async () => {
      await testCircuitQA.select(6);
    });
    expect(await page.evaluate(() => testCircuitQA.selected())).toBe(0);
    for (let i = 0; i < 5; i++) await page.locator(".wordmark").click();
    await expect(page.locator("#circuit-test-access")).toBeVisible();
    await expect(page.locator("#tracks button:disabled")).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => window.testCircuitQA);
    await expect(page.locator("#tracks button:disabled")).toHaveCount(0);
    await page.evaluate(async () => {
      await testCircuitQA.select(6);
      await testCircuitQA.start();
    });
    expect(await page.evaluate(() => testCircuitQA.snapshot())).toBe(true);
    expect(
      await page
        .locator("#circuit-test-access")
        .evaluate((badge) => getComputedStyle(badge).pointerEvents),
    ).toBe("none");
    await page
      .locator("#circuit-test-access")
      .evaluate((badge) => badge.click());
    expect(await page.evaluate(() => testCircuitQA.access())).toBe(true);
    await page.evaluate(() => testCircuitQA.result());
    expect(
      await page.evaluate(() => [
        localStorage.getItem("nv-records"),
        localStorage.getItem("nv-progression"),
      ]),
    ).toEqual([null, null]);
    await expect(page.locator(".new-record-mark")).toHaveCount(0);
    await page.evaluate(() => testCircuitQA.return());
    await page.locator("#circuit-test-access").click();
    await expect(page.locator("#tracks button:disabled")).toHaveCount(4);
    await expect(page.locator("#circuit-test-access")).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => window.testCircuitQA);
    await expect(page.locator("#tracks button:disabled")).toHaveCount(4);
    await page.evaluate(async () => {
      await testCircuitQA.start();
      testCircuitQA.result();
    });
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("nv-progression"))?.classes?.c1,
      ),
    ).toBeTruthy();
    expect(
      await page.evaluate(
        () =>
          Object.keys(JSON.parse(localStorage.getItem("nv-records"))).length,
      ),
    ).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(
    "Test circuit access: desktop/mobile locks, local opt-in, race snapshot and no saved results PASS",
  );
} finally {
  await browser.close();
  await server.close();
}
