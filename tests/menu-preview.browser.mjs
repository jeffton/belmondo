import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Isolated real-WebGL model sheets without a second World GPU context.
const output =
  process.env.PREVIEW_ARTIFACTS || "/var/tmp/belmondo-preview-models";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const measurements = {};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/preview-sheet", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0;background:#101f2c;color:#d8f5ff;font:14px monospace"><main style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px"></main></body></html>',
    }),
  );
  await page.goto(`${server.resolvedUrls.local[0]}preview-sheet`);
  for (const [name, width, height] of [
    ["desktop", 600, 400],
    ["portrait", 312, 264],
    ["landscape", 380, 140],
    ["small-portrait", 256, 110],
  ]) {
    const result = await page.evaluate(
      async ({ width, height }) => {
        const THREE = await import("/node_modules/.vite/deps/three.js");
        const { MenuPreview } = await import("/src/menu-preview.js");
        const { makeTrack, TRACKS } = await import("/src/track.js");
        const { CRAFT } = await import("/src/race.js");
        const { SPEED_CLASSES } = await import("/src/speed-classes.js");
        const main = document.querySelector("main");
        main.replaceChildren();
        const element = document.createElement("div");
        Object.assign(element.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: `${width}px`,
          height: `${height}px`,
        });
        const label = document.createElement("strong");
        label.id = "model-name";
        Object.assign(label.style, {
          position: "absolute",
          bottom: "5px",
          left: "0",
          font: "bold 16px/20px monospace",
        });
        element.append(label);
        document.body.append(element);
        const preview = new MenuPreview(element);
        const loaded = new Promise((resolve) => {
          THREE.DefaultLoadingManager.onLoad = resolve;
        });
        preview.setCraft(0);
        await loaded;
        THREE.DefaultLoadingManager.onLoad = undefined;
        const results = [];
        for (const [stage, definitions] of [
          ["craft", CRAFT],
          ["class", SPEED_CLASSES],
          ["track", TRACKS],
        ]) {
          for (let i = 0; i < definitions.length; i++) {
            if (stage === "craft") preview.setCraft(i);
            else if (stage === "class") preview.setClass(i);
            else preview.setTrack(makeTrack(i));
            preview.setStage(stage);
            label.textContent = definitions[i].name;
            const model =
              stage === "craft"
                ? preview.craft
                : stage === "class"
                  ? preview.classModel
                  : preview.coursePivot;
            const speed = { craft: 0.32, class: 0.25, track: 0.16 }[stage];
            const point = new THREE.Vector3();
            let minimumFill = 1;
            let gain;
            for (let heading = 0; heading < 16; heading++) {
              preview.time = (heading * Math.PI) / 8 / speed;
              preview.draw(0);
              preview.camera.updateMatrixWorld(true);
              model.updateMatrixWorld(true);
              let left = Infinity,
                right = -Infinity,
                top = Infinity,
                bottom = -Infinity;
              model.traverseVisible((object) => {
                const positions = object.geometry?.getAttribute("position");
                if (!positions) return;
                for (let j = 0; j < positions.count; j++) {
                  point
                    .fromBufferAttribute(positions, j)
                    .applyMatrix4(object.matrixWorld)
                    .project(preview.camera);
                  const x = ((point.x + 1) * width) / 2;
                  const y = ((1 - point.y) * height) / 2;
                  left = Math.min(left, x);
                  right = Math.max(right, x);
                  top = Math.min(top, y);
                  bottom = Math.max(bottom, y);
                }
              });
              const labelTop = label.getBoundingClientRect().top;
              if (left < 0 || right > width || top < 0 || bottom > labelTop - 4)
                throw new Error(
                  `${stage}/${i} clips or overlaps label at ${width}x${height}, heading ${heading}: ${[left, right, top, bottom, labelTop]}`,
                );
              minimumFill = Math.min(
                minimumFill,
                Math.max(
                  (right - left) / width,
                  (bottom - top) / (labelTop - 4),
                ),
              );
              const aspect = width / height;
              const oldSpan =
                (stage === "track" ? 1.06 : 1.16) * Math.max(1, aspect);
              gain =
                (2 * oldSpan) / (preview.camera.right - preview.camera.left);
            }
            preview.time = 2.5;
            preview.draw(0);
            const image = document.createElement("img");
            image.src = preview.renderer.domElement.toDataURL();
            Object.assign(image.style, {
              display: "block",
              width: "100%",
              imageRendering: "pixelated",
            });
            const figure = document.createElement("figure");
            figure.style.margin = "0";
            figure.append(
              document.createTextNode(
                `${definitions[i].name} / ${width}×${height}`,
              ),
              image,
            );
            main.append(figure);
            results.push({
              stage,
              name: definitions[i].name,
              gain,
              minimumFill,
              ...preview.resources,
            });
          }
        }
        preview.dispose();
        element.remove();
        await Promise.all([...document.images].map((image) => image.decode()));
        return results;
      },
      { width, height },
    );
    assert.equal(result.length, 13);
    assert.ok(
      result.every((entry) => entry.width === Math.floor(width * 0.55)),
    );
    measurements[name] = result;
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    console.log(
      name,
      result
        .map(
          ({ name, gain, minimumFill }) =>
            `${name}: ${gain.toFixed(2)}x, minFill ${Math.round(minimumFill * 100)}%`,
        )
        .join("; "),
    );
  }
  await writeFile(
    `${output}/measurements.json`,
    JSON.stringify(measurements, null, 2),
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
