import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Real menu DOM/CSS and preview renderer; main World is deliberately not started.
const output =
  process.env.PREVIEW_ARTIFACTS || "/var/tmp/belmondo-preview-layout";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const measurements = {};
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.route("**/src/main.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  for (const [name, width, height] of [
    ["desktop", 1280, 800],
    ["portrait", 390, 844],
    ["landscape", 844, 390],
    ["small-landscape", 568, 320],
    ["small-portrait", 390, 568],
    ["narrow-portrait", 320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(server.resolvedUrls.local[0]);
    await page.addStyleTag({ url: "/src/style.css" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const THREE = await import("/node_modules/.vite/deps/three.js");
      const { MenuPreview } = await import("/src/menu-preview.js");
      const { TRACKS, makeTrack } = await import("/src/track.js");
      const { CRAFT } = await import("/src/race.js");
      const { SPEED_CLASSES } = await import("/src/speed-classes.js");
      document.querySelector("#tracks").innerHTML = TRACKS.map(
        (t) =>
          `<button class="choice"><b>${t.name}</b><small class="track-progress">★ BEST / 1ST</small></button>`,
      ).join("");
      document.querySelector("#crafts").innerHTML = CRAFT.map(
        (t) => `<button class="choice"><b>${t.name}</b></button>`,
      ).join("");
      document.querySelector("#craft-stats").innerHTML = [
        "SPEED",
        "HANDLING",
        "SHIELD",
      ]
        .map(
          (t) =>
            `<div class="craft-stat"><dt>${t}</dt><dd><b class="craft-stat-value">100</b><span class="craft-stat-track"><i style="width:100%"></i></span></dd></div>`,
        )
        .join("");
      const element = document.querySelector("#menu-model");
      element.hidden = false;
      const preview = new MenuPreview(element);
      const loaded = new Promise((resolve) => {
        THREE.DefaultLoadingManager.onLoad = resolve;
      });
      preview.setCraft(0);
      await loaded;
      THREE.DefaultLoadingManager.onLoad = undefined;
      window.previewTest = {
        preview,
        TRACKS,
        makeTrack,
        CRAFT,
        SPEED_CLASSES,
        THREE,
      };
    });
    measurements[name] = [];
    for (const [stage, count] of [
      ["craft", 3],
      ["class", 3],
      ["track", 7],
    ]) {
      for (let index = 0; index < count; index++) {
        const result = await page.evaluate(
          ({ stage, index }) => {
            const { preview, TRACKS, makeTrack, CRAFT, SPEED_CLASSES, THREE } =
              window.previewTest;
            const menu = document.querySelector("#menu");
            menu.dataset.stage = stage;
            document.querySelectorAll(".setup-stage").forEach((panel) => {
              panel.hidden = panel.dataset.panel !== stage;
            });
            document.querySelector("#setup-back").hidden = false;
            const stats = document.querySelector("#craft-stats");
            stats.hidden = stage !== "craft";
            const subtitle = document.querySelector("#model-subtitle");
            subtitle.hidden = stage !== "track";
            subtitle.textContent =
              stage === "track"
                ? TRACKS[index].subtitle.split("/")[1].trim()
                : "";
            const definitions = {
              track: TRACKS,
              craft: CRAFT,
              class: SPEED_CLASSES,
            }[stage];
            const label = document.querySelector("#model-name");
            label.textContent = definitions[index].name;
            document.querySelector("#craft-circuit").textContent =
              TRACKS[0].name;
            if (stage === "track") preview.setTrack(makeTrack(index));
            else if (stage === "craft") preview.setCraft(index);
            else preview.setClass(index);
            preview.setStage(stage);
            const model = {
              track: preview.coursePivot,
              craft: preview.craft,
              class: preview.classModel,
            }[stage];
            const element = preview.element.getBoundingClientRect();
            const labelTop = label.getBoundingClientRect().top - element.top;
            const speed = { track: 0.16, craft: 0.32, class: 0.25 }[stage];
            const point = new THREE.Vector3();
            for (let heading = 0; heading < 16; heading++) {
              preview.time = (heading * Math.PI) / 8 / speed;
              preview.draw(0);
              preview.camera.updateMatrixWorld(true);
              model.updateMatrixWorld(true);
              model.traverseVisible((object) => {
                const positions = object.geometry?.getAttribute("position");
                if (!positions) return;
                for (let j = 0; j < positions.count; j++) {
                  point
                    .fromBufferAttribute(positions, j)
                    .applyMatrix4(object.matrixWorld)
                    .project(preview.camera);
                  const x = ((point.x + 1) * element.width) / 2;
                  const y = ((1 - point.y) * element.height) / 2;
                  if (x < 0 || x > element.width || y < 0 || y > labelTop - 4)
                    throw new Error(
                      `${stage}/${index}: clipping or label overlap at heading ${heading}`,
                    );
                }
              });
            }
            preview.time = 2.5;
            preview.draw(0);
            const body = document
              .querySelector(".menu-body")
              .getBoundingClientRect();
            const footer = document
              .querySelector("footer")
              .getBoundingClientRect();
            const bottom = Math.max(
              element.bottom,
              stats.hidden ? 0 : stats.getBoundingClientRect().bottom,
              subtitle.hidden ? 0 : subtitle.getBoundingClientRect().bottom,
            );
            if (
              element.left < body.right &&
              element.right > body.left &&
              bottom > body.top
            )
              throw new Error(
                `${stage}/${index}: model/title/stats overlap controls: ${bottom} > ${body.top}`,
              );
            if (bottom > footer.top)
              throw new Error(`${stage}/${index}: preview overlaps footer`);
            const span = stage === "track" ? 1.06 : 1.16;
            const oldWidth =
              innerWidth < innerHeight ? innerWidth * 0.8 : innerWidth * 0.47;
            const oldHeight =
              innerWidth < innerHeight
                ? innerHeight <= 690
                  ? Math.max(92, innerHeight - 440)
                  : Math.max(110, innerHeight - 580)
                : innerHeight -
                  innerHeight * 0.21 -
                  Math.max(innerHeight * 0.26, footer.height + 84);
            const oldUnits = 2 * span * Math.max(1 / oldWidth, 1 / oldHeight);
            const newUnits =
              (preview.camera.right - preview.camera.left) / element.width;
            return {
              name: definitions[index].name,
              stage,
              width: element.width,
              height: element.height,
              linearGain: oldUnits / newUnits,
            };
          },
          { stage, index },
        );
        measurements[name].push(result);
        if (!["small-portrait", "narrow-portrait"].includes(name))
          await page.screenshot({
            path: `${output}/${name}-${stage}-${index}.png`,
          });
      }
    }
    await page.evaluate(() => window.previewTest.preview.dispose());
    console.log(
      name,
      measurements[name]
        .map(({ name, linearGain }) => `${name} ${linearGain.toFixed(2)}x`)
        .join("; "),
    );
  }
  assert.ok(
    Object.values(measurements).every((entries) => entries.length === 13),
  );
  await writeFile(
    `${output}/measurements.json`,
    JSON.stringify(measurements, null, 2),
  );
} finally {
  await browser.close();
  await server.close();
}
