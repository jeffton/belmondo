import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";

// Isolated DOM fixture: no WebGL, app mocks, or changes to the user's storage.
// Deliberately allow viewport zoom so the Chromium positive control proves the
// gesture really zooms, independently of the app's restrictive viewport meta.
const fixture = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<style>
  html, body { margin: 0; }
  #menu, dialog { touch-action: pan-y; }
  #menu { height: 55vh; overflow: auto; }
  #content { height: 1200px; padding: 20px; }
  #controls { display: flex; height: 35vh; touch-action: none; }
  #controls > button { flex: 1; }
  dialog { width: 70vw; height: 50vh; overflow: auto; }
</style>
<section id="menu"><div id="content">
  <p id="label">BELMONDO menu: select a class and circuit.</p>
  <button id="next">Next</button><button id="help">Help</button>
</div></section>
<div id="controls">
  <button id="stick">Stick</button><button id="left">Left brake</button>
  <button id="right">Right brake</button><button id="fire">Fire</button>
</div>
<dialog><button id="close">Close</button><div style="height:1200px">Controls help</div></dialog>
<script type="module">
  import { installZoomPolicy } from '/src/zoom-policy.js';
  window.removeZoomPolicy = installZoomPolicy();
  window.state = { active: [], fire: 0, clicks: 0, moves: 0, touchCanceled: [] };
  document.querySelector('#next').onclick = () => state.clicks++;
  document.querySelector('#help').onclick = () => document.querySelector('dialog').showModal();
  document.querySelector('#close').onclick = () => document.querySelector('dialog').close();
  for (const button of document.querySelectorAll('#controls > button')) {
    button.onpointerdown = event => {
      button.setPointerCapture(event.pointerId);
      state.active.push(button.id);
      if (button.id === 'fire') state.fire++;
    };
    button.onpointermove = () => state.moves++;
    button.onpointerup = () => { state.active = state.active.filter(id => id !== button.id); };
    button.onpointercancel = () => { throw new Error('Flight pointer canceled'); };
  }
  for (const type of ['touchstart', 'touchmove'])
    document.addEventListener(type, event => state.touchCanceled.push(event.defaultPrevented), { passive: true });
  window.ready = true;
</script>`;
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const url = server.resolvedUrls.local[0];
const engines = process.env.ZOOM_ENGINES?.split(",") || ["chromium", "webkit"];
try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({
      headless: process.env.ZOOM_HEADED !== "1",
      ...(engine === "webkit"
        ? { executablePath: process.env.ZOOM_WEBKIT_EXECUTABLE }
        : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/zoom-fixture", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: fixture,
        }),
      );
      await page.goto(`${url}zoom-fixture`);
      await page.waitForFunction(() => window.ready);
      const cancellation = await page.evaluate(() => {
        const send = (type, properties = {}) => {
          const event =
            type === "wheel"
              ? new WheelEvent(type, { cancelable: true, ...properties })
              : new Event(type, { cancelable: true });
          document.dispatchEvent(event);
          return event.defaultPrevented;
        };
        const before = ["gesturestart", "gesturechange", "gestureend"].map(
          (type) => send(type),
        );
        const wheel = [send("wheel", { ctrlKey: true }), send("wheel")];
        const touches = [send("touchstart"), send("touchmove")];
        const key = new KeyboardEvent("keydown", {
          key: "+",
          ctrlKey: true,
          cancelable: true,
        });
        document.dispatchEvent(key);
        removeZoomPolicy();
        const removed =
          send("gesturestart") || send("wheel", { ctrlKey: true });
        return { before, wheel, touches, key: key.defaultPrevented, removed };
      });
      expect(cancellation).toEqual({
        before: [true, true, true],
        wheel: [true, false],
        touches: [false, false],
        key: false,
        removed: false,
      });
      await page.reload();
      await page.waitForFunction(() => window.ready);
      await page.locator("#next").tap();
      expect(await page.evaluate(() => state.clicks)).toBe(1);
      await page.locator("#help").tap();
      await expect(page.locator("dialog")).toBeVisible();
      await page.locator("#close").tap();
      await expect(page.locator("dialog")).not.toBeVisible();

      if (engine === "chromium") {
        const cdp = await context.newCDPSession(page);
        const pinch = async () => {
          const points = (spread) => [
            { id: 0, x: 190 - spread, y: 220 },
            { id: 1, x: 190 + spread, y: 220 },
          ];
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: points(40),
          });
          for (let spread = 45; spread <= 150; spread += 5) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: points(spread),
            });
            await page.waitForTimeout(16);
          }
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        };
        // Positive control: the same injected pinch MUST zoom an unrestricted
        // surface, otherwise a stable scale would not test anything.
        await page.evaluate(() => {
          removeZoomPolicy();
          document.querySelector("#menu").style.touchAction = "auto";
        });
        await pinch();
        await expect
          .poll(() => page.evaluate(() => visualViewport.scale))
          .toBeGreaterThan(1.1);
        await page.reload();
        await page.waitForFunction(() => window.ready);
        // Reload preserves Chromium's visual viewport zoom from the positive
        // control. Restore the initial scale before testing the blocked surface.
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
        await pinch();
        await expect
          .poll(() => page.evaluate(() => visualViewport.scale))
          .toBe(1);
        const label = await page.locator("#label").boundingBox();
        for (let tap = 0; tap < 2; tap++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ id: 0, x: label.x + 30, y: label.y + 10 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await page.waitForTimeout(80);
        }
        expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ id: 0, x: 190, y: 350 }],
        });
        for (let y = 340; y >= 150; y -= 10) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ id: 0, x: 190, y }],
          });
          await page.waitForTimeout(16);
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => page.locator("#menu").evaluate((el) => el.scrollTop))
          .toBeGreaterThan(50);
        const points = [];
        for (const [index, id] of [
          "stick",
          "left",
          "right",
          "fire",
        ].entries()) {
          const box = await page.locator(`#${id}`).boundingBox();
          points.push({
            id: index,
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: points,
          });
        }
        expect(await page.evaluate(() => state.active)).toEqual([
          "stick",
          "left",
          "right",
          "fire",
        ]);
        points[0].y -= 20;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: points,
        });
        expect(await page.evaluate(() => state.moves)).toBeGreaterThan(0);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        expect(await page.evaluate(() => state.active)).toEqual([]);
        expect(await page.evaluate(() => state.fire)).toBe(1);
        expect(
          await page.evaluate(() => state.touchCanceled.some(Boolean)),
        ).toBe(false);
        expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
      } else {
        // Playwright WebKit runs the real engine but exposes no native pinch or
        // multi-touch injection. These taps/cancellation checks are NOT iOS QA.
        await page.locator("#next").tap();
        await page.locator("#next").tap();
        expect(await page.evaluate(() => state.clicks)).toBe(3);
        expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
      }
      expect(errors).toEqual([]);
      console.log(
        `${engine}: zoom event policy, cleanup, menu/dialog taps PASS`,
      );
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
