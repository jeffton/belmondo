import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";

const root = new URL("./", import.meta.url);
const server = createServer(async (req, res) => {
  const name =
    req.url === "/manifest.webmanifest" ? "manifest.webmanifest" : "index.html";
  res.setHeader(
    "Content-Type",
    name.endsWith("html")
      ? "text/html; charset=utf-8"
      : "application/manifest+json",
  );
  res.end(await readFile(new URL(name, root)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "webkit" && process.env.WEBKIT_EXECUTABLE_PATH
        ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
        : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.addInitScript(() => {
        window.testPads = [];
        Object.defineProperty(navigator, "getGamepads", {
          value: () => window.testPads,
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(await page.locator("#native").isDisabled(), true);
      await page.locator("#disconnected").check();
      await page.locator("#native").tap();
      assert.equal(await page.locator("#native").isChecked(), true);
      await page.locator("#overlay-label").tap();
      assert.equal(await page.locator("#overlay").isChecked(), true);
      assert.match(
        await page.locator("#log").textContent(),
        /overlay: click trusted=true/,
      );
      await page.locator("#sync").tap();
      assert.equal(await page.locator("#script-input").isChecked(), true);
      // WebKit builds before 313638 may wrongly promote this to trusted. Log, do not mistake for haptics.
      console.log(
        name,
        "script event:",
        (await page.locator("#log").textContent()).match(
          /script-input: click[^\n]+/,
        )[0],
      );
      await page.locator("#frame").tap();
      await page.waitForFunction(
        () => !document.querySelector("#script-input").checked,
      );
      // Guard sees a pad between pointerdown and native click default handling.
      await page.evaluate(() => {
        document.querySelector("#overlay-label").addEventListener(
          "pointerdown",
          () => {
            window.testPads = [{ connected: true }];
          },
          { once: true },
        );
      });
      await page.locator("#overlay-label").tap();
      assert.equal(await page.locator("#overlay").isChecked(), true);
      assert.equal(await page.locator("#native").isDisabled(), true);
      // A connection notification remains locked even if subsequent polls are empty.
      await page.evaluate(() => {
        window.testPads = [];
        window.dispatchEvent(new Event("gamepadconnected"));
      });
      assert.equal(await page.locator("#disconnected").isChecked(), false);
      await page.locator("#disconnected").check();
      assert.equal(await page.locator("#native").isDisabled(), true);
      await page.reload();
      await page.locator("#disconnected").check();
      // A game-loop-style callback must not run after a controller connection.
      await page.evaluate(() => {
        document.querySelector("#frame").addEventListener("click", () => {
          window.dispatchEvent(new Event("gamepadconnected"));
        });
      });
      await page.locator("#frame").tap();
      await page.waitForTimeout(60);
      assert.equal(await page.locator("#script-input").isChecked(), false);
      await page.reload();
      await page.locator("#disconnected").check();
      await page.evaluate(() => {
        document.querySelector("#frame").addEventListener("click", () => {
          Object.defineProperty(document, "hidden", { value: true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      });
      await page.locator("#frame").tap();
      await page.waitForTimeout(60);
      assert.equal(await page.locator("#script-input").isChecked(), false);
      assert.equal(await page.locator("#native").isDisabled(), true);
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `${name}: PASS input semantics, guards, frame cancellation, portrait/landscape. No physical haptics assertion.`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
