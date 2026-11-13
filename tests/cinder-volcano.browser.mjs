// Run only in a centrally granted, exclusive browser/GPU slot.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

if (process.env.CINDER_VOLCANO_GPU_GRANTED !== "1")
  throw new Error("An exclusive central GPU grant is required");
const sourceUrl = process.env.SOURCE_URL;
const output = process.env.OUTPUT_DIR;
if (!sourceUrl || !output)
  throw new Error("SOURCE_URL and OUTPUT_DIR are required");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const report = [];
try {
  for (const [name, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["mobile", 844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (process.env.BASELINE === "1")
      await page.route("**/src/cinder-volcanoes.js*", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: "export function buildCinderVolcanoes() {}",
        }),
      );
    await page.route("**/__cinder_volcano__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{width:100vw;height:100vh;display:block;image-rendering:pixelated}</style><canvas></canvas>',
      }),
    );
    await page.goto(`${sourceUrl}/__cinder_volcano__.html`);
    const volcanoCount = await page.evaluate(async () => {
      const source = await (await fetch("/src/world.js")).text();
      const threePath = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import(threePath),
        ]);
      const ready = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (url) => reject(new Error(url));
      });
      const world = new World(document.querySelector("canvas"));
      const track = makeTrack(5),
        race = new Race(track, 0, "trial");
      race.countdown = 0;
      world.build(track);
      world.setupRacers(race, CRAFT);
      await ready;
      window.cinderVolcano = { world, race, track };
      return (
        world.scene.getObjectByName("volcanic-districts").userData.volcanoes
          ?.length ?? 0
      );
    });
    assert.equal(volcanoCount, process.env.BASELINE === "1" ? 0 : 3);
    for (const view of ["chase", "first-person"]) {
      for (const distance of [
        0.05, 0.12, 0.2, 0.35, 0.42, 0.49, 0.58, 0.68, 0.8, 0.9,
      ]) {
        const measurement = await page.evaluate(
          ({ view, distance }) => {
            const { world, race, track } = window.cinderVolcano;
            const s = distance * track.length;
            const f = track.frame(s),
              r = race.player;
            r.s = r.contactS = s;
            r.branch = 0;
            r.position.copy(f.p);
            r.position.y += 2.2;
            r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
            r.pitch = -Math.atan2(
              f.tangent.y,
              Math.hypot(f.tangent.x, f.tangent.z),
            );
            r.yawRate = 0;
            r.velocity.copy(f.tangent).multiplyScalar(110);
            r.speed = 110;
            world.setView(view);
            for (let i = 0; i < 30; i++) world.draw(race, 1 / 60);
            return {
              s,
              quality: world.quality,
              drawCalls: world.renderer.info.render.calls,
              triangles: world.renderer.info.render.triangles,
              geometries: world.renderer.info.memory.geometries,
              textures: world.renderer.info.memory.textures,
            };
          },
          { view, distance },
        );
        const shot = `${name}-${view}-${distance}`;
        await page.screenshot({ path: `${output}/${shot}.png` });
        report.push({ shot, ...measurement });
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
