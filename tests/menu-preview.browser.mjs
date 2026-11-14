import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Isolated model sheets: every authored course at desktop, portrait and landscape
// preview sizes, without the main World consuming another GPU context.
const output =
  process.env.PREVIEW_ARTIFACTS || "/var/tmp/belmondo-preview-models";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
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
    ["portrait", 312, 170],
    ["landscape", 380, 140],
  ]) {
    const result = await page.evaluate(
      async ({ width, height }) => {
        const { MenuPreview } = await import("/src/menu-preview.js");
        const { makeTrack, TRACKS } = await import("/src/track.js");
        const main = document.querySelector("main");
        main.replaceChildren();
        const results = [];
        // One renderer, capture each course as an image before releasing it.
        const element = document.createElement("div");
        Object.assign(element.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: `${width}px`,
          height: `${height}px`,
        });
        document.body.append(element);
        const preview = new MenuPreview(element);
        preview.setStage("track");
        for (let i = 0; i < TRACKS.length; i++) {
          preview.setTrack(makeTrack(i));
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
            document.createTextNode(`${TRACKS[i].name} / ${width}×${height}`),
            image,
          );
          main.append(figure);
          results.push({ ...preview.resources });
        }
        preview.dispose();
        element.remove();
        await Promise.all([...document.images].map((image) => image.decode()));
        return results;
      },
      { width, height },
    );
    assert.equal(result.length, 7);
    assert.ok(
      result.every((entry) => entry.width === Math.floor(width * 0.55)),
    );
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    console.log(
      name,
      JSON.stringify(
        result.map(({ width, height, renderCalls }) => ({
          width,
          height,
          renderCalls,
        })),
      ),
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
