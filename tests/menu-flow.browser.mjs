import { chromium, webkit, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { TRACKS } from "../src/track.ts";

const url = process.env.GAME_URL || "http://127.0.0.1:5196";
const output = process.env.MENU_ARTIFACTS || "/var/tmp/belmondo-menu-flow";
await mkdir(output, { recursive: true });
const useWebKit = process.env.MENU_ENGINE === "webkit";
const browser = await (useWebKit ? webkit : chromium).launch(
  useWebKit
    ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
    : {
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      },
);
const errors = [];
const faultlineIndex = TRACKS.findIndex((track) => track.name === "FAULTLINE");
try {
  const viewports = process.env.MENU_VIEWPORTS
    ? JSON.parse(process.env.MENU_VIEWPORTS)
    : [
        [1440, 900],
        [390, 844],
        [320, 568],
        [844, 390],
        [568, 320],
      ];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 900 ? 2 : 1,
      hasTouch: width < 900,
      isMobile: width < 900,
    });
    await context.addInitScript(
      (layoutIds) => {
        localStorage.setItem(
          "nv-progression",
          JSON.stringify({
            version: 1,
            classes: {
              c3: Object.fromEntries(
                layoutIds.map((id) => [id, { bestPosition: 1, won: true }]),
              ),
            },
          }),
        );
      },
      TRACKS.map((track) => track.layoutId),
    );
    // Linux WebKit cannot install an iOS home-screen app. Model a portrait
    // standalone webview whose visible area is shorter than its lvh box.
    const standaloneInset = Number(process.env.MENU_STANDALONE_INSET ?? 0);
    const emulateStandalone =
      useWebKit && height > width && standaloneInset > 0;
    const visibleHeight = height - (emulateStandalone ? standaloneInset : 0);
    if (emulateStandalone)
      await context.addInitScript((height) => {
        const match = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = match(query);
          if (query.includes("display-mode: standalone"))
            Object.defineProperty(result, "matches", { value: true });
          return result;
        };
        Object.defineProperty(window.visualViewport, "height", {
          value: height,
        });
      }, visibleHeight);
    const page = await context.newPage();
    const insets =
      width >= 900
        ? { top: 0, right: 0, bottom: 0, left: 0 }
        : height > width
          ? { top: 59, right: 0, bottom: 34, left: 0 }
          : { top: 0, right: 47, bottom: 21, left: 47 };
    if (useWebKit) {
      // Playwright's Linux WebKit has no iPhone screen cutout. Substitute
      // measured iPhone env() values into the built stylesheet, not the DOM.
      await page.route("**/assets/*.css", async (route) => {
        const response = await route.fetch();
        let body = (await response.text()).replace(
          /env\(safe-area-inset-(top|right|bottom|left)\)/g,
          (_, side) => `${insets[side]}px`,
        );
        if (emulateStandalone)
          body = body.replaceAll(
            "(display-mode:standalone)",
            "(orientation:portrait)",
          );
        await route.fulfill({ response, body });
      });
    } else {
      await (
        await context.newCDPSession(page)
      ).send("Emulation.setSafeAreaInsetsOverride", { insets });
    }
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.nullVector?.telemetry.state === "menu",
    );
    const landing = await page.evaluate(
      () => window.nullVector.telemetry.menuRacers[0].s,
    );
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "mode");
    await expect(page.locator("#menu h1")).toHaveText("BELMONDO");
    const checkFooter = async () => {
      const footer = await page
        .locator("#menu .menu-footer")
        .evaluate((element) => ({
          bounds: element.getBoundingClientRect().toJSON(),
          padding: parseFloat(getComputedStyle(element).paddingBottom),
          background: getComputedStyle(element).backgroundColor,
          controls: [...element.querySelectorAll("a, button, input")]
            .filter((control) => control.getClientRects().length)
            .map((control) => control.getBoundingClientRect().bottom),
        }));
      expect(footer.bounds.bottom).toBeCloseTo(visibleHeight, 0);
      expect(footer.padding).toBe(insets.bottom);
      expect(footer.background).toBe("rgb(24, 23, 21)");
      for (const bottom of footer.controls)
        expect(bottom).toBeLessThanOrEqual(visibleHeight - insets.bottom + 1);
    };
    await checkFooter();
    const checkDialog = async (open, id, last) => {
      const dialog = page.locator(id);
      const trigger = page.locator(open);
      if (width < 900) await trigger.tap();
      else await trigger.click();
      await expect(dialog).toBeVisible();
      if (last === ".help-small")
        await expect
          .poll(() =>
            page.locator("#concept").evaluate((image) => image.naturalWidth),
          )
          .toBeGreaterThan(0);
      const geometry = await dialog.evaluate((element, last) => {
        const client = element.getBoundingClientRect();
        const top = element.scrollTop;
        element.scrollTop = element.scrollHeight;
        const target = element.querySelector(last).getBoundingClientRect();
        element.scrollTop = top;
        return {
          box: client.toJSON(),
          horizontalOverflow: element.scrollWidth - element.clientWidth,
          end: target.toJSON(),
        };
      }, last);
      expect(geometry.box.y, id + " top safe").toBeGreaterThanOrEqual(
        insets.top - 1,
      );
      expect(geometry.box.bottom, id + " bottom safe").toBeLessThanOrEqual(
        visibleHeight - insets.bottom + 1,
      );
      expect(geometry.box.x, id + " left safe").toBeGreaterThanOrEqual(
        insets.left - 1,
      );
      expect(geometry.box.right, id + " right safe").toBeLessThanOrEqual(
        width - insets.right + 1,
      );
      expect(
        geometry.horizontalOverflow,
        id + " horizontal overflow",
      ).toBeLessThanOrEqual(1);
      expect(
        geometry.end.y,
        id + " last content starts inside",
      ).toBeGreaterThanOrEqual(geometry.box.y - 1);
      expect(
        geometry.end.bottom,
        id + " last content reachable",
      ).toBeLessThanOrEqual(geometry.box.bottom + 1);
      const close = dialog.locator(".close");
      if (width < 900) await close.tap();
      else await close.click();
      await expect(dialog).toBeHidden();
    };
    await checkDialog("#help-open", "#help-dialog", ".arsenal span:last-child");
    await checkDialog("#music-open", "#music-dialog", "#effects-volume");
    await checkDialog("#art-open", "#art-dialog", ".help-small");
    if (width === viewports[0][0] && height === viewports[0][1]) {
      const icons = await page.evaluate(async () => {
        const manifest = await (
          await fetch(document.querySelector('link[rel="manifest"]').href)
        ).json();
        const resources = [
          ...manifest.icons.map(({ src, sizes }) => [src, sizes]),
          ...[
            ...document.querySelectorAll(
              'link[rel="icon"], link[rel="apple-touch-icon"]',
            ),
          ].map(({ href, sizes }) => [href, sizes.value]),
        ];
        const dimensions = await Promise.all(
          resources.map(async ([url, size]) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            return [size, `${image.naturalWidth}x${image.naturalHeight}`];
          }),
        );
        return {
          id: manifest.id,
          start: manifest.start_url,
          scope: manifest.scope,
          dimensions,
        };
      });
      expect([icons.id, icons.start, icons.scope]).toEqual(["/", "/", "/"]);
      expect(icons.dimensions.map(([size]) => size).sort()).toEqual([
        "180x180",
        "192x192",
        "512x512",
        "64x64",
        "any",
      ]);
      for (const [declared, natural] of icons.dimensions)
        if (declared !== "any") expect(natural).toBe(declared);
    }
    await expect(page.locator("#menu .masthead")).not.toContainText(
      /cir[cq]uit/i,
    );
    await page.screenshot({ path: `${output}/${width}-${height}-mode.png` });
    await page.locator("#setup-next").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
    await page.waitForFunction(
      (s) => window.nullVector.telemetry.menuRacers[0].s > s,
      landing,
    );
    await expect(page.locator("#tracks")).toBeHidden();
    await expect(page.locator("#start")).toBeHidden();
    await page.locator('input[name="speed-class"][value="2"]').check();
    await checkFooter();
    await page.screenshot({ path: `${output}/${width}-${height}-class.png` });
    await page.locator("#setup-next").click();
    for (const stage of ["track", "craft"]) {
      await checkFooter();
      if (stage === "track") {
        await expect(page.locator("#tracks button")).toHaveCount(TRACKS.length);
        for (const [index, track] of TRACKS.entries())
          await expect(page.locator("#tracks button").nth(index)).toContainText(
            track.name,
          );
        const courseIndices = process.env.MENU_COURSES
          ? JSON.parse(process.env.MENU_COURSES)
          : TRACKS.map((_, index) => index);
        for (const index of courseIndices) {
          const track = TRACKS[index];
          const button = page.locator("#tracks button").nth(index);
          await button.scrollIntoViewIfNeeded();
          if (width < 900) await button.tap();
          else await button.click();
          await expect(page.locator("#circuit-name")).toHaveText(track.name);
          await page.waitForFunction((index) => {
            const t = window.nullVector.telemetry;
            return !t.trackLoading && t.loadedTrack === index;
          }, index);
          const bounds = await button.boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(insets.left - 1);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            width - insets.right + 1,
          );
          expect(bounds.y).toBeGreaterThanOrEqual(insets.top - 1);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(
            visibleHeight - insets.bottom + 1,
          );
          expect(
            await page.evaluate(
              () => window.nullVector.telemetry.previewResources.geometries,
            ),
          ).toBeGreaterThan(0);
          if (index === 0)
            await page.screenshot({
              path: `${output}/${width}-${height}-whiteout.png`,
            });
        }
        await page.locator("#tracks button").nth(faultlineIndex).click();
      } else {
        const marks = new Set();
        for (const craft of [0, 1, 2]) {
          const choice = page.locator(
            `#crafts button[data-craft-index="${craft}"]`,
          );
          const emblem = choice.locator(".team-emblem");
          await expect(emblem).toBeVisible();
          marks.add(await emblem.innerHTML());
          await choice.click();
          await expect(choice).toHaveAttribute("aria-pressed", "true");
          const row = await choice.boundingBox();
          const mark = await emblem.boundingBox();
          // The clipped red selection can begin nine pixels inside the row.
          expect(mark.x - row.x).toBeGreaterThanOrEqual(16);
        }
        expect(marks.size).toBe(3);
      }
      await expect(page.locator("#menu")).toHaveAttribute("data-stage", stage);
      await expect(page.locator("#menu-model")).toBeVisible();
      const rotation = await page.evaluate(
        () => window.nullVector.telemetry.menuModelRotation,
      );
      await page.waitForFunction(
        (r) => window.nullVector.telemetry.menuModelRotation !== r,
        rotation,
      );
      if (width === 1440 && stage === "track") {
        const samples = [];
        const resourceCycles = Number(process.env.MENU_RESOURCE_CYCLES ?? 2);
        for (let cycle = 0; cycle < resourceCycles; cycle++) {
          for (
            let i = 0;
            i < (await page.locator("#tracks button").count());
            i++
          ) {
            await page.locator("#tracks button").nth(i).click();
            const before = await page.evaluate(
              () => window.nullVector.telemetry.menuModelRotation,
            );
            await page.waitForFunction(
              (r) => window.nullVector.telemetry.menuModelRotation !== r,
              before,
            );
          }
          samples.push(
            await page.evaluate(() => ({
              world: window.nullVector.telemetry.resources,
              preview: window.nullVector.telemetry.previewResources,
            })),
          );
        }
        // The live feed's moving camera changes visible World buffers. The
        // complete inset model has a fixed footprint across replacement cycles.
        if (resourceCycles >= 2) {
          expect(samples[1].preview.geometries).toBe(
            samples[0].preview.geometries,
          );
          expect(samples[1].preview.textures).toBe(samples[0].preview.textures);
          console.log("Course resource cycle stable:", samples[1]);
        }
        await page.locator("#tracks button").nth(faultlineIndex).click();
      }
      const backgroundBuffer = await page
        .locator("#game")
        .evaluate((canvas) => [canvas.width, canvas.height]);
      expect(backgroundBuffer).toEqual([
        Math.round(width * 0.55),
        Math.round(visibleHeight * 0.55),
      ]);
      const nativePreview = await page
        .locator(".menu-preview-canvas")
        .evaluate((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return {
            width: canvas.width,
            height: canvas.height,
            cssWidth: rect.width,
            cssHeight: rect.height,
            dpr: devicePixelRatio,
          };
        });
      expect(nativePreview.width).toBeGreaterThanOrEqual(
        Math.floor(nativePreview.cssWidth * 0.55),
      );
      expect(nativePreview.height).toBeGreaterThanOrEqual(
        Math.floor(nativePreview.cssHeight * 0.55),
      );
      const layout = await page.evaluate(
        (insets) => {
          const menu = document.getElementById("menu");
          const model = document
            .getElementById("menu-model")
            .getBoundingClientRect();
          const body = document
            .querySelector(".menu-body")
            .getBoundingClientRect();
          const visible = [
            ...document.querySelectorAll("#menu button, #menu a, #menu input"),
          ].filter((e) => e.getClientRects().length);
          return {
            stage: menu.dataset.stage,
            content: [...document.querySelectorAll(".menu-body > *")]
              .filter((element) => element.getClientRects().length)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  id: element.id,
                  top: rect.top,
                  bottom: rect.bottom,
                  height: rect.height,
                };
              }),
            scroll: menu.scrollHeight - menu.clientHeight,
            width: innerWidth,
            height: innerHeight,
            model: { top: model.top, bottom: model.bottom, right: model.right },
            body: {
              top: body.top,
              bottom: body.bottom,
              left: body.left,
              right: body.right,
            },
            headerBottom: document
              .querySelector("#menu .masthead")
              .getBoundingClientRect().bottom,
            footerTop: document
              .querySelector("#menu footer")
              .getBoundingClientRect().top,
            outside: visible
              .filter((e) => {
                const b = e.getBoundingClientRect();
                return (
                  b.left < insets.left - 1 ||
                  b.top < insets.top - 1 ||
                  b.right > innerWidth - insets.right + 1 ||
                  b.bottom > innerHeight - insets.bottom + 1
                );
              })
              .map((e) => e.id || e.textContent),
          };
        },
        { ...insets, bottom: insets.bottom + height - visibleHeight },
      );
      await page.screenshot({
        path: `${output}/${width}-${height}-${stage}.png`,
      });
      expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(1);
      expect(layout.outside, JSON.stringify(layout)).toEqual([]);
      expect(layout.model.top).toBeGreaterThanOrEqual(0);
      expect(layout.body.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(
        layout.headerBottom - 1,
      );
      expect(layout.body.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(
        layout.footerTop + 1,
      );
      if (width < 700 && height > width)
        expect(layout.model.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(
          layout.body.top + 2,
        );
      if (stage === "track") await page.locator("#setup-next").click();
    }
    if (process.env.MENU_LAYOUT_ONLY === "1") {
      console.log(
        `${width}×${height}: eight course names, live previews and track/craft bounds PASS`,
      );
      await context.close();
      continue;
    }
    await page.locator("#setup-back").click();
    await expect(
      page.locator("#tracks button").nth(faultlineIndex),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator("#setup-back").click();
    await expect(
      page.locator('input[name="speed-class"][value="2"]'),
    ).toBeChecked();
    await page.locator("#setup-next").click();
    await page.locator("#setup-next").click();
    await expect(
      page.locator('#crafts button[data-craft-index="2"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator("#help-open").click();
    await expect(page.locator("#help-dialog")).toBeVisible();
    await page.locator("#help-dialog .close").click();
    await page.locator("#start").click();
    await page.waitForFunction(
      () => window.nullVector.telemetry.state === "race",
    );
    expect(await page.evaluate(() => window.nullVector.telemetry.classId)).toBe(
      "c3",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    if (width > height) {
      const pause = await page.locator("#pause-panel").evaluate((dialog) => {
        const { right, width } = dialog.getBoundingClientRect();
        const panel = dialog.querySelector(".panel");
        const bounds = panel.getBoundingClientRect();
        const bevel = Number.parseFloat(
          getComputedStyle(panel).clipPath.match(/polygon\(([\d.]+)px/)[1],
        );
        const controls = [...dialog.querySelectorAll("h2, button")].map(
          (element) => element.getBoundingClientRect().toJSON(),
        );
        return {
          right,
          width,
          panelRight: bounds.right,
          bevelX: bounds.left + bevel,
          controls,
        };
      });
      expect(pause.width).toBeGreaterThanOrEqual(width * 0.9);
      expect(pause.right).toBeGreaterThanOrEqual(width - 1);
      expect(pause.panelRight).toBeGreaterThanOrEqual(width - 1);
      expect(pause.controls[0].left - pause.bevelX).toBeGreaterThanOrEqual(11);
      for (const { left, right, top, bottom } of pause.controls) {
        expect(left).toBeGreaterThanOrEqual(insets.left);
        expect(right).toBeLessThanOrEqual(width - insets.right);
        expect(top).toBeGreaterThanOrEqual(insets.top);
        expect(bottom).toBeLessThanOrEqual(height - insets.bottom);
      }
    } else {
      const pause = await page.locator("#pause-panel").evaluate((dialog) => ({
        panel: dialog.querySelector(".panel").getBoundingClientRect().toJSON(),
        controls: [...dialog.querySelectorAll("h2, button")].map((control) =>
          control.getBoundingClientRect().toJSON(),
        ),
      }));
      expect(pause.panel.bottom).toBeCloseTo(visibleHeight, 0);
      for (const { left, right, top, bottom } of pause.controls) {
        expect(left).toBeGreaterThanOrEqual(insets.left);
        expect(right).toBeLessThanOrEqual(width - insets.right);
        expect(top).toBeGreaterThanOrEqual(insets.top);
        expect(bottom).toBeLessThanOrEqual(visibleHeight - insets.bottom);
      }
    }
    await page.screenshot({ path: `${output}/${width}-${height}-pause.png` });
    await checkDialog("#pause-music", "#music-dialog", "#effects-volume");
    await expect(page.locator("#pause-panel")).toBeVisible();
    if (width < 900) await page.locator("#quit").tap();
    else await page.locator("#quit").click();
    await expect(page.locator("#menu")).toHaveAttribute("data-stage", "track");
    await checkFooter();
    await expect(
      page.locator("#tracks button").nth(faultlineIndex),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#start")).toBeHidden();
    await page.waitForFunction(
      (s) => window.nullVector.telemetry.menuRacers[0].s !== s,
      landing,
    );
    console.log(
      `${width}×${height}: stages, selections, responsive dialogs, livefeed, race and return PASS`,
    );
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
