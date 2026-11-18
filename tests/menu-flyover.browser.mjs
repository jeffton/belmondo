import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { TRACKS } from "../src/track.ts";
import { goToSetupStage } from "./helpers/setup-menu.mjs";

const output = process.env.FLYOVER_ARTIFACTS || "/var/tmp/belmondo-flyover";
const indices = process.env.FLYOVER_COURSES
  ? process.env.FLYOVER_COURSES.split(",").map(Number)
  : TRACKS.map((_, i) => i);
const baseline = process.env.FLYOVER_BASELINE === "1";
await mkdir(output, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const reports = [];
try {
  for (const [width, height] of [
    [1200, 750],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: height > width,
      hasTouch: height > width,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    // Seek the real menu loop, its racers, World, LOWRES and actual UI. No
    // runtime test switch or alternate camera implementation ships.
    await page.route("**/src/main.ts", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert(body.includes("demoDistance += dt * 32;"));
      assert(body.includes("world.draw(race, dt, true);"));
      await route.fulfill({
        response,
        body: body
          .replace(
            "demoDistance += dt * 32;",
            "demoDistance = window.flyoverQA?.station ?? demoDistance + dt * 32;",
          )
          .replace(
            "world.draw(race, dt, true);",
            `world.draw(race, dt, true);
          if (window.flyoverQA?.capture) {
            window.flyoverQA.capture(world, track);
            window.flyoverQA.capture = null;
          }`,
          ),
      });
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    for (let i = 0; i < 5; i++) await page.locator(".wordmark").click();
    await expect(page.locator("#circuit-test-access")).toBeVisible();
    await goToSetupStage(page, "track");

    for (const index of indices) {
      await page.locator(`#tracks button[data-index="${index}"]`).click();
      await page.waitForFunction(
        (i) =>
          window.nullVector.telemetry.loadedTrack === i &&
          !window.nullVector.telemetry.trackLoading,
        index,
        { timeout: 60000 },
      );

      const report = await page.evaluate(
        async ({ index, baseline }) => {
          const source = await (await fetch("/src/world.ts")).text();
          const url = source.match(
            /from\s+["']([^"']*\/three\.js[^"']*)["']/,
          )[1];
          const THREE = await import(url);
          const telemetry = window.nullVector.telemetry;
          const canvas = document.querySelector("#game");
          const tiles = document.createElement("canvas");
          const tileWidth = innerWidth > innerHeight ? 256 : 122;
          const tileHeight = Math.round((tileWidth * innerHeight) / innerWidth);
          tiles.width = tileWidth * 6;
          tiles.height = tileHeight * 4;
          const paint = tiles.getContext("2d");
          const length = telemetry.trackLength;
          const capture = (station, fn) =>
            new Promise((resolve, reject) => {
              window.flyoverQA = {
                station,
                capture(world, track) {
                  try {
                    resolve(fn(world, track));
                  } catch (error) {
                    reject(error);
                  }
                },
              };
            });
          const cameraDirection = new THREE.Vector3();
          const ray = new THREE.Raycaster();
          const box = new THREE.Box3();
          const nearby = [];
          const intersections = [];
          let scenery;
          const sample = (world, track, station, tile = -1) => {
            if (!scenery) {
              world.scene.updateMatrixWorld(true);
              scenery = [];
              // Measure near-plane occlusion in the actual scene. Exclude
              // demo ships, which are moving independently of the camera.
              const racers = new Set(world.ships);
              const excluded = new Set();
              for (const ship of racers)
                ship.traverse((obj) => excluded.add(obj));
              world.scene.traverseVisible((obj) => {
                if (!obj.isMesh || excluded.has(obj)) return;
                obj.geometry.computeBoundingBox();
                const bounds = new THREE.Box3();
                if (obj.isInstancedMesh) {
                  obj.computeBoundingBox();
                  bounds.copy(obj.boundingBox).applyMatrix4(obj.matrixWorld);
                } else {
                  bounds
                    .copy(obj.geometry.boundingBox)
                    .applyMatrix4(obj.matrixWorld);
                }
                scenery.push({ obj, bounds });
              });
            }
            const { camera } = world;
            camera.getWorldDirection(cameraDirection);
            box.min.copy(camera.position).addScalar(-2.5);
            box.max.copy(camera.position).addScalar(2.5);
            nearby.length = 0;
            for (const { obj, bounds } of scenery)
              if (box.intersectsBox(bounds)) nearby.push(obj);
            ray.near = 0;
            ray.far = 2.5;
            ray.set(camera.position, cameraDirection);
            intersections.length = 0;
            ray.intersectObjects(nearby, false, intersections);
            const hit = intersections[0];
            if (tile >= 0) {
              const x = (tile % 6) * tileWidth;
              const y = Math.floor(tile / 6) * tileHeight;
              paint.drawImage(canvas, x, y, tileWidth, tileHeight);
              paint.fillStyle = "#101010";
              paint.fillRect(x, y, 45, 16);
              paint.fillStyle = "#f9efd6";
              paint.font = "12px monospace";
              paint.fillText(
                `${((station / length) * 100).toFixed(1)}%`,
                x + 1,
                y + 12,
              );
            }
            return {
              station: station / length,
              centerHit: hit?.distance ?? null,
              object: hit
                ? [
                    hit.object.name,
                    hit.object.parent?.name,
                    hit.face?.normal.toArray(),
                  ]
                : null,
              position: camera.position.toArray(),
              heading: cameraDirection.toArray(),
              lowRes: world.quality === "retro",
              size: world.renderer
                .getDrawingBufferSize(new THREE.Vector2())
                .toArray(),
            };
          };
          const rows = [];
          const frames = [];
          const steps = baseline ? 80 : 128;
          const visualStations = Array.from(
            { length: 24 },
            (_, i) => (i + 0.5) / 24,
          );
          // Coast comparison: denser evidence in the finish-frontage sector.
          if (index === 2)
            visualStations.splice(
              0,
              8,
              ...[0, 0.015, 0.025, 0.035, 0.045, 0.065, 0.085, 0.105],
            );
          const checkpoints = [
            ...new Set([
              ...Array.from({ length: steps }, (_, i) => i / steps),
              ...visualStations,
            ]),
          ].sort((a, b) => a - b);
          for (const u of checkpoints) {
            const station = u * length;
            rows.push(
              await capture(station, (world, track) =>
                sample(world, track, station, visualStations.indexOf(u)),
              ),
            );
          }
          // Native menu rate, consecutive renders through a recognizable feature,
          // not a slideshow of unrelated camera poses.
          const start =
            length * [0.76, 0.82, 0.031, 0.2, 0.19, 0.534, 0.345, 0.31][index];
          const videoCanvas = document.createElement("canvas");
          videoCanvas.width = tileWidth;
          videoCanvas.height = tileHeight;
          const videoPaint = videoCanvas.getContext("2d");
          if (!baseline) {
            const step = 32 / 15;
            for (let frame = 0; frame < 45; frame++) {
              frames.push(
                await capture(start + frame * step, () => {
                  videoPaint.drawImage(canvas, 0, 0, tileWidth, tileHeight);
                  return videoCanvas.toDataURL("image/jpeg", 0.8).split(",")[1];
                }),
              );
            }
          }
          window.flyoverQA = null;
          return {
            rows,
            frames,
            tile: tiles.toDataURL("image/jpeg", 0.88).split(",")[1],
          };
        },
        { index, baseline },
      );
      const name = `${width}x${height}-${index}`;
      await writeFile(
        `${output}/${name}.jpg`,
        Buffer.from(report.tile, "base64"),
      );
      await Promise.all(
        report.frames.map((data, i) =>
          writeFile(
            `${output}/${name}-${String(i).padStart(2, "0")}.jpg`,
            Buffer.from(data, "base64"),
          ),
        ),
      );
      assert(
        report.rows.every((row) => row.lowRes && row.size.every((n) => n > 0)),
      );
      reports.push({ name, course: TRACKS[index].name, rows: report.rows });
      console.log(
        name,
        TRACKS[index].name,
        report.rows.length,
        "positions, near center hits:",
        report.rows.filter((row) => row.centerHit !== null).length,
      );
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
  await server.close();
}
