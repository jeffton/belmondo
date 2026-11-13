import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import { createServer } from "vite";
import { TRACKS } from "../src/track.js";
import { CRAFT } from "../src/race.js";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const engine = process.env.SAFE_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "webkit"
    ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
    : {
        args: [
          "--no-sandbox",
          "--disable-gpu",
          "--disable-software-rasterizer",
        ],
      }),
});
const output = process.env.SAFE_ARTIFACTS || "/var/tmp/belmondo-edge-chrome";
await mkdir(output, { recursive: true });
const html = (await readFile("index.html", "utf8")).replace(
  /<script\b[\s\S]*?<\/script>/g,
  "",
);
const css = await readFile("src/style.css", "utf8");
const results = [];
try {
  for (const standalone of [false, true]) {
    for (const [width, height, top, right, bottom, left] of [
      [852, 393, 0, 59, 21, 59],
      [852, 393, 0, 0, 21, 59],
      [844, 390, 0, 47, 21, 47],
      [393, 852, 59, 0, 34, 0],
      [320, 568, 20, 0, 0, 0],
      [568, 320, 0, 0, 0, 0],
      [1440, 900, 0, 0, 0, 0],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        hasTouch: true,
      });
      // Render the actual menu markup/CSS without allocating World/WebGL. Linux
      // engines cannot supply an iPhone's env() values or native scroll-edge chrome.
      await page.setContent(
        html.replace(
          "<head>",
          `<head><base href="${server.resolvedUrls.local[0]}">`,
        ),
      );
      const insets = { top, right, bottom, left };
      await page.addStyleTag({
        content: (standalone
          ? css
              .replace(
                "@media (display-mode: standalone), (display-mode: fullscreen)",
                "@media all",
              )
              // Resolve independently reported native unit sizes (WK313800),
              // rather than letting Linux's equal dvh/lvh mask the orphan strip.
              .replaceAll("100dvh", `${height - top}px`)
              .replaceAll("100lvh", `${height}px`)
          : css
        ).replace(
          /env\(safe-area-inset-(top|right|bottom|left)\)/g,
          (_, edge) => `${insets[edge]}px`,
        ),
      });
      await page.evaluate(
        ({ tracks, crafts }) => {
          document.body.classList.add("touch");
          document.getElementById("tracks").innerHTML = tracks
            .map((name) => `<button class="choice"><b>${name}</b></button>`)
            .join("");
          document.getElementById("crafts").innerHTML = crafts
            .map((name) => `<button class="choice"><b>${name}</b></button>`)
            .join("");
          document.getElementById("menu-model").hidden = false;
        },
        {
          tracks: TRACKS.map((track) => track.name),
          crafts: CRAFT.map((craft) => craft.name),
        },
      );
      await page.evaluate(() => document.fonts.ready);
      for (const stage of ["class", "track", "craft"]) {
        await page.evaluate((stage) => {
          document.getElementById("menu").dataset.stage = stage;
          for (const panel of document.querySelectorAll("[data-panel]"))
            panel.hidden = panel.dataset.panel !== stage;
          document.getElementById("setup-options").hidden = stage !== "class";
          document.getElementById("setup-back").hidden = stage === "class";
          document.getElementById("setup-next").hidden = stage === "craft";
          document.getElementById("start").hidden = stage !== "craft";
          document.getElementById("model-name").textContent =
            stage === "class"
              ? "SINGULARITY"
              : stage === "track"
                ? "VESPER CIRCUIT"
                : "WRAITH";
        }, stage);
        const observed = await page.evaluate(() => {
          const box = (element) => {
            const r = element.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          };
          const header = document.querySelector(".masthead"),
            menu = document.getElementById("menu"),
            footer = document.querySelector("#menu footer");
          const controls = [
            ...document.querySelectorAll("#menu button, #menu a"),
          ]
            .filter((el) => el.getClientRects().length)
            .map((el) => ({ name: el.textContent.trim(), ...box(el) }));
          window.scrollTo(0, 300);
          menu.scrollTop = 300;
          return {
            header: {
              ...box(header),
              display: getComputedStyle(header).display,
              background: getComputedStyle(header).backgroundColor,
              image: getComputedStyle(header).backgroundImage,
              position: getComputedStyle(header).position,
            },
            headerContent: [...header.children]
              .filter((element) => element.getClientRects().length)
              .map(box),
            headerAtSample: header.contains(
              document.elementFromPoint(innerWidth / 2, 4),
            ),
            footerAtSample: footer.contains(
              document.elementFromPoint(innerWidth / 2, innerHeight - 4),
            ),
            root: {
              display: getComputedStyle(menu).display,
              boxes: menu.getClientRects().length,
              bodyDisplay: getComputedStyle(document.body).display,
              heightMode: getComputedStyle(document.documentElement)
                .getPropertyValue("--app-height")
                .trim(),
              overflow: getComputedStyle(document.documentElement).overflow,
              bodyOverflow: getComputedStyle(document.body).overflow,
              background: getComputedStyle(document.documentElement)
                .backgroundColor,
            },
            veilHeight: getComputedStyle(menu, "::before").height,
            footer: {
              ...box(footer),
              background: getComputedStyle(footer).backgroundColor,
              paddingBottom: getComputedStyle(footer).paddingBottom,
            },
            menuTouchAction: getComputedStyle(
              document.querySelector(".menu-layout"),
            ).touchAction,
            toolControls: [...footer.querySelectorAll("button, a")].map(
              (element) => ({
                ...box(element),
                border: getComputedStyle(element).borderBottomStyle,
                fontSize: getComputedStyle(element).fontSize,
              }),
            ),
            body: box(document.querySelector(".menu-body")),
            model: box(document.getElementById("menu-model")),
            world: box(document.getElementById("game")),
            controls,
            obsoleteFeedLabel:
              document
                .querySelector(".world-caption")
                .textContent.includes("LIVE CIRCUIT FEED") ||
              !!document.querySelector(".world-caption .live-dot"),
            rootScroll: document.scrollingElement.scrollTop,
            menuScroll: menu.scrollTop,
            overflow: menu.scrollHeight - menu.clientHeight,
            toolsInFooter: [
              ...document.querySelectorAll(".menu-links :is(button,a)"),
            ].every((el) => footer.contains(el)),
          };
        });
        const detail = `${engine} ${width}×${height} ${stage} ${JSON.stringify(observed)}`;
        assert.equal(observed.root.display, "contents", detail);
        assert.equal(observed.root.boxes, 0, detail);
        assert.equal(observed.root.bodyDisplay, "grid", detail);
        assert.equal(
          observed.root.heightMode,
          standalone ? `${height}px` : "100dvh",
          detail,
        );
        assert.equal(observed.root.overflow, "clip", detail);
        assert.equal(observed.root.bodyOverflow, "clip", detail);
        assert.equal(observed.menuTouchAction, "none", detail);
        assert.equal(observed.veilHeight, `${height}px`, detail);
        assert.equal(observed.footer.background, "rgb(16, 32, 44)", detail);
        assert.equal(observed.footer.paddingBottom, `${bottom}px`, detail);
        if (standalone)
          assert.equal(
            observed.root.background,
            observed.footer.background,
            detail,
          );
        assert.equal(observed.world.left, 0, detail);
        assert.equal(observed.world.right, width, detail);
        assert.equal(observed.footer.left, 0, detail);
        assert.equal(observed.footer.right, width, detail);
        assert.equal(observed.footer.bottom, height, detail);
        assert.equal(observed.footer.height, 29 + bottom, detail);
        assert.equal(observed.toolControls.length, 4, detail);
        for (const control of observed.toolControls) {
          assert.equal(control.height, 28, detail);
          assert.equal(control.border, "none", detail);
          assert.equal(control.fontSize, "9px", detail);
        }
        assert.equal(observed.footerAtSample, true, detail);
        assert.equal(observed.obsoleteFeedLabel, false, detail);
        assert.equal(observed.rootScroll, 0, detail);
        assert.equal(observed.menuScroll, 0, detail);
        assert.ok(observed.overflow <= 1, detail);
        assert.ok(observed.toolsInFooter, detail);
        assert.ok(observed.body.bottom <= observed.footer.top + 1, detail);
        assert.ok(
          observed.model.width > 0 && observed.model.height > 0,
          detail,
        );
        for (const control of observed.controls) {
          assert.ok(
            control.left >= left - 1 &&
              control.right <= width - right + 1 &&
              control.top >= top - 1 &&
              control.bottom <= height - bottom + 1,
            detail,
          );
        }
        assert.notEqual(observed.header.display, "none", detail);
        assert.equal(observed.header.left, 0, detail);
        assert.equal(observed.header.right, width, detail);
        assert.equal(observed.header.top, 0, detail);
        assert.equal(observed.headerAtSample, true, detail);
        assert.equal(observed.header.background, "rgb(16, 32, 44)", detail);
        assert.equal(observed.header.image, "none", detail);
        assert.equal(observed.header.position, "sticky", detail);
        // WebKit LocalFrameView::fixedContainerEdges, revision d3afea7:
        // sample rect contracts by 4px and the pinned box must span >=90%.
        assert.ok(
          observed.header.width >= (width - 8) * 0.9 &&
            observed.header.height > 10,
          detail,
        );
        for (const content of observed.headerContent)
          assert.ok(
            content.left >= left &&
              content.right <= width - right &&
              content.top >= top,
            detail,
          );
        assert.ok(observed.body.top >= observed.header.bottom - 1, detail);
        await page.screenshot({
          path: `${output}/${standalone ? "standalone-" : "browser-"}${width}-${height}-${left}-${stage}.png`,
        });
        results.push({ standalone, width, height, insets, stage, ...observed });
      }
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, 500);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.equal(await page.evaluate(() => scrollY), 0);
      const dialogScroll = await page.evaluate(() => {
        const dialog = document.getElementById("help-dialog");
        dialog.showModal();
        const available = dialog.scrollHeight - dialog.clientHeight;
        dialog.scrollTop = 300;
        const result = {
          available,
          top: dialog.scrollTop,
          root: scrollY,
          action: getComputedStyle(dialog).touchAction,
        };
        dialog.close();
        return result;
      });
      assert.equal(dialogScroll.root, 0);
      assert.equal(dialogScroll.action, "pan-y");
      if (dialogScroll.available > 0) assert.ok(dialogScroll.top > 0);
      await page.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(
    `${engine}: ${results.length} full-bleed/safe-content/native-eligibility states PASS`,
  );
} finally {
  await browser.close();
  await server.close();
}
