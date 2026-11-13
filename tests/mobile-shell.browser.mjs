import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5197";
const output = "test-artifacts/mobile-shell";
await mkdir(output, { recursive: true });
const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace("</head>", '<link rel="stylesheet" href="/src/style.css"></head>');
const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-gpu"],
});
const report = [];
try {
  for (const [name, width, height, insets] of [
    ["portrait-safe", 390, 844, { top: 59, bottom: 34, left: 0, right: 0 }],
    ["landscape-safe", 844, 390, { top: 0, bottom: 21, left: 59, right: 59 }],
    ["compact", 320, 568, { top: 0, bottom: 0, left: 0, right: 0 }],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
    await page.route("**/__mobile_shell__.html", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto(`${url}/__mobile_shell__.html`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.body.classList.add("touch");
      document.querySelector("#menu").hidden = true;
      document.querySelector("#hud").hidden = false;
      const { createWeaponHUD } = await import("/src/weapon-ui.js");
      window.inventory = createWeaponHUD(
        document.querySelector("#weapon"),
        document.querySelector("#touch-fire"),
        document.querySelector("#weapon-roster"),
      );
      window.inventory("MISSILE");
      document.querySelector("#speed").textContent = "999";
      document.querySelector("#lap").innerHTML = "5<small>/5</small>";
      document.querySelector("#timer").textContent = "12:59.99";
    });
    const selectors = [
      "#position",
      "#lap",
      "#timer",
      "#lap-times",
      "#view",
      "#pause",
      "#weapon",
      ".shield-instrument",
      ".velocity",
      "#steer-pad",
      "#air-pad",
      ".touch-actions",
    ];
    const boxes = {};
    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${name} ${selector}`).not.toBeNull();
      expect(box.x, `${name} ${selector} left safe`).toBeGreaterThanOrEqual(
        insets.left,
      );
      expect(box.y, `${name} ${selector} top safe`).toBeGreaterThanOrEqual(
        insets.top,
      );
      expect(
        box.x + box.width,
        `${name} ${selector} right safe`,
      ).toBeLessThanOrEqual(width - insets.right);
      expect(
        box.y + box.height,
        `${name} ${selector} bottom safe`,
      ).toBeLessThanOrEqual(height - insets.bottom);
      boxes[selector] = box;
    }
    await expect(page.locator("#hud-track")).toBeHidden();
    expect(
      await page
        .locator(".lap-times")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    const stick = boxes["#steer-pad"];
    expect(stick.width).toBe(stick.height);
    expect(
      await page
        .locator("#steer-pad")
        .evaluate((el) => getComputedStyle(el).borderRadius),
    ).toBe("50%");
    await expect(page.locator("#steer-pad")).toHaveText("");
    await expect(page.locator("#air-pad")).toHaveText("");
    await expect(page.locator(".touch-actions")).toHaveText("");
    expect(boxes["#air-pad"].width).toBe(128);
    expect(boxes["#air-pad"].height).toBe(80);
    const canvas = await page.locator("#game").boundingBox();
    expect(canvas).toEqual({ x: 0, y: 0, width, height });
    await page.screenshot({ path: `${output}/${name}.png` });
    await page.evaluate(() => window.inventory(null));
    await expect(page.locator("#touch-fire")).toBeDisabled();
    // Manifest is parsed by Chromium, rather than only checking its JSON syntax.
    const app = await cdp.send("Page.getAppManifest");
    expect(app.errors).toEqual([]);
    const installability = await cdp.send("Page.getInstallabilityErrors");
    expect(installability.installabilityErrors).toEqual([]);
    const manifest = JSON.parse(app.data);
    expect(manifest.display).toBe("standalone");
    expect(manifest.short_name).toBe("BELMONDO");
    for (const icon of manifest.icons) {
      const response = await context.request.get(new URL(icon.src, url).href);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
    await page.evaluate(() =>
      document.querySelector("#music-dialog").showModal(),
    );
    const close = await page.locator("#music-dialog .close").boundingBox();
    expect(close.y).toBeGreaterThanOrEqual(insets.top);
    expect(close.x + close.width).toBeLessThanOrEqual(width - insets.right);
    report.push({ name, insets, boxes, close, manifest: app.url });
    await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(
  "Mobile shell: CDP safe-area portrait/landscape, compact viewport, full-bleed canvas and Chromium manifest parsing PASS.",
);
