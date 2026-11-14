import { chromium, expect } from "@playwright/test";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );

  const styles = await page.evaluate(() => {
    const elements = [
      document.documentElement,
      document.body,
      document.querySelector("#menu .masthead > span:nth-child(2)"),
      document.querySelector("#menu button"),
      document.querySelector("#hud"),
      document.querySelector("#menu .brand-symbol"),
      document.querySelector("#menu h1.wordmark"),
    ];
    return elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.userSelect, style.webkitUserSelect];
    });
  });
  expect(styles).toEqual(Array.from({ length: 7 }, () => ["none", "none"]));

  const paragraph = page.locator("#menu .masthead > span:nth-child(2)");
  await paragraph.scrollIntoViewIfNeeded();
  const paragraphBox = await paragraph.boundingBox();
  await page.mouse.move(paragraphBox.x + 5, paragraphBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(
    paragraphBox.x + paragraphBox.width - 5,
    paragraphBox.y + paragraphBox.height - 2,
    { steps: 12 },
  );
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toBe("");

  await page.keyboard.press("Control+A");
  expect(await page.evaluate(() => getSelection().toString())).toBe("");

  for (const logo of [
    page.locator("#menu .brand-symbol"),
    page.locator("#menu h1.wordmark"),
  ]) {
    const box = await logo.boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection().toString())).toBe("");
  }
  for (let tap = 0; tap < 5; tap += 1) {
    await page.locator("#menu h1.wordmark").click();
  }
  await expect(page.locator("#circuit-test-access")).toBeVisible();
  await page.locator("#setup-next").click();
  await expect(page.locator("#menu")).toHaveAttribute("data-stage", "class");
  await page.locator('#speed-class input[value="1"]').check();
  await expect(page.locator('#speed-class input[value="1"]')).toBeChecked();

  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await touch.goto(url);
  await touch.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  expect(
    await touch
      .locator("#menu .masthead > span:nth-child(2)")
      .evaluate((element) => getComputedStyle(element).webkitUserSelect),
  ).toBe("none");
  expect(
    await touch
      .locator("#menu h1.wordmark")
      .evaluate((element) => getComputedStyle(element).webkitUserSelect),
  ).toBe("none");

  const cdp = await touch.context().newCDPSession(touch);
  const touchPoint = (x, y) => ({ x: Math.round(x), y: Math.round(y), id: 1 });
  for (const logo of [
    touch.locator("#menu .brand-symbol"),
    touch.locator("#menu h1.wordmark"),
  ]) {
    const box = await logo.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(box.x + 2, box.y + box.height / 2)],
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touchPoint(box.x + box.width - 2, box.y + box.height / 2)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await touch.evaluate(() => getSelection().toString())).toBe("");
  }
  await cdp.detach();
  await touch.locator("#music-open").tap();
  await expect(touch.locator("#music-dialog")).toHaveAttribute("open", "");
  await touch.locator("#music-dialog .close").tap();
  await expect(touch.locator("#music-dialog")).not.toHaveAttribute("open", "");
} finally {
  await browser.close();
}
