import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Isolated render fixture only: racer placement is never written into the app.
const url = process.env.SOURCE_URL || "http://127.0.0.1:5178";
await mkdir("test-artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const cases = [],
  errors = [];
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1000, height: 625 }],
    ["mobile", { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__shield_fixture__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>",
      }),
    );
    await page.goto(`${url}/__shield_fixture__.html`);
    const result = await page.evaluate(async () => {
      const source = await (await fetch("/src/world.js")).text();
      const threeModule = source.match(
        /from\s+["']([^"']*\/three\.js[^"']*)["']/,
      )[1];
      const [{ World }, { Race, CRAFT }, { makeTrack }, THREE] =
        await Promise.all([
          import("/src/world.js"),
          import("/src/race.js"),
          import("/src/track.js"),
          import(threeModule),
        ]);
      const world = new World(document.querySelector("canvas"));
      world.quality = "retro";
      world.resize();
      const track = makeTrack(TRACK_INDEX.COAST);
      const loaded = new Promise((resolve, reject) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
        THREE.DefaultLoadingManager.onError = (asset) =>
          reject(new Error(asset));
      });
      world.build(track);
      const race = new Race(track, 0, "race");
      world.setupRacers(race, CRAFT);
      await loaded;
      for (const racer of race.racers) {
        const s = track.length * 0.06 - racer.id * 150;
        const f = track.frame(s);
        racer.s = racer.contactS = s;
        racer.branch = 0;
        racer.position.copy(f.p).addScaledVector(f.up, 2.2);
        racer.yaw = Math.atan2(f.tangent.x, f.tangent.z);
        racer.pitch = 0;
        racer.yawRate = 0;
        racer.speed = 100;
        racer.protect = 0;
      }
      const gl = world.renderer.getContext();
      function pixels() {
        const data = new Uint8Array(
          gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
        );
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        return data;
      }
      const records = [];
      for (const view of ["chase", "first-person"]) {
        world.view = view;
        world.cameraReady = false;
        race.player.protect = 0;
        world.draw(race, 0);
        const off = pixels();
        const offImage = world.renderer.domElement.toDataURL();
        race.player.protect = 3;
        world.draw(race, 0);
        const on = pixels();
        const image = world.renderer.domElement.toDataURL();
        const shield = world.ships[0].userData.shield;
        shield.geometry.computeBoundingBox();
        const size = shield.geometry.boundingBox.getSize(new THREE.Vector3());
        let changed = 0,
          totalDelta = 0,
          centerDelta = 0,
          centerCount = 0;
        const width = gl.drawingBufferWidth,
          height = gl.drawingBufferHeight;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const delta =
              Math.abs(off[i] - on[i]) +
              Math.abs(off[i + 1] - on[i + 1]) +
              Math.abs(off[i + 2] - on[i + 2]);
            if (delta > 3) changed++;
            totalDelta += delta;
            if (
              x > width * 0.35 &&
              x < width * 0.65 &&
              y > height * 0.35 &&
              y < height * 0.65
            ) {
              centerDelta += delta;
              centerCount++;
            }
          }
        records.push({
          view,
          visible: shield.visible,
          sceneOwned: shield.parent === world.scene,
          hullVisible: world.ships[0].visible,
          wireframe: shield.material.wireframe,
          transparent: shield.material.transparent,
          opacity: shield.material.opacity,
          depthWrite: shield.material.depthWrite,
          size: size.toArray(),
          changed,
          changedFraction: changed / (width * height),
          meanChannelDelta: totalDelta / (width * height * 3),
          centerChannelDelta: centerDelta / (centerCount * 3),
          image,
          offImage,
        });
        race.player.protect = 0;
        world.draw(race, 0);
        records.at(-1).cleared = !shield.visible;
      }
      const old = world.ships
        .map((ship) => [ship, ship.userData.shadow, ship.userData.shield])
        .flat();
      const countBefore = world.scene.children.length;
      world.setupRacers(race, CRAFT);
      const lifecycle = {
        countBefore,
        countAfter: world.scene.children.length,
        oldDetached: old.every((object) => object.parent === null),
        shields: world.scene.children.filter(
          (object) => object.name === "shield",
        ).length,
        racers: race.racers.length,
      };
      return { records, lifecycle };
    });
    expect(result.lifecycle.oldDetached).toBe(true);
    expect(result.lifecycle.countAfter).toBe(result.lifecycle.countBefore);
    expect(result.lifecycle.shields).toBe(result.lifecycle.racers);
    for (const record of result.records) {
      expect(record.visible).toBe(true);
      expect(record.sceneOwned).toBe(true);
      expect(record.hullVisible).toBe(record.view === "chase");
      expect(record.wireframe).toBe(false);
      expect(record.transparent).toBe(true);
      expect(record.opacity).toBeGreaterThan(0);
      expect(record.opacity).toBeLessThan(1);
      expect(record.depthWrite).toBe(false);
      expect(record.size[1]).toBeLessThan(record.size[0] / 2);
      expect(record.changed).toBeGreaterThan(0);
      expect(record.cleared).toBe(true);
      for (const [suffix, data] of [
        ["on", record.image],
        ["off", record.offImage],
      ])
        await writeFile(
          `test-artifacts/shield-${device}-${record.view}-${suffix}.png`,
          Buffer.from(data.split(",")[1], "base64"),
        );
      const { image, offImage, ...metrics } = record;
      cases.push({ device, ...metrics, lifecycle: result.lifecycle });
    }
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log(
    `Shield: ${cases.length} desktop/mobile chase/cockpit render cases and scene lifecycle passed.`,
  );
} finally {
  await writeFile(
    "test-artifacts/shield-report.json",
    JSON.stringify({ url, cases, errors }, null, 2),
  );
  await browser.close();
}
