import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--autoplay-policy=document-user-activation-required",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = AudioContext;
    window.menuPeak = 0;
    window.AudioContext = class extends Native {
      createDynamicsCompressor() {
        window.effectsContext = this;
        const compressor = super.createDynamicsCompressor();
        const analyser = this.createAnalyser();
        analyser.fftSize = 1024;
        compressor.connect(analyser);
        const pcm = new Float32Array(1024);
        setInterval(() => {
          analyser.getFloatTimeDomainData(pcm);
          for (const x of pcm)
            window.menuPeak = Math.max(window.menuPeak, Math.abs(x));
        }, 8);
        return compressor;
      }
    };
  });
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5199");
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  // No earlier AudioContext or controller interaction: this real tap both
  // unlocks WebAudio and starts asynchronous sample fetch/decode.
  await page.locator('input[name="mode"][value="trial"]').tap();
  await page.waitForFunction(() => window.menuPeak > 0.005);
  const peak = await page.evaluate(() => window.menuPeak);
  assert(peak < 0.65);
  assert.equal(
    await page.evaluate(() => window.effectsContext.state),
    "running",
  );
  await page.evaluate(() => {
    const input = document.querySelector("#effects-volume");
    input.value = "0";
    input.dispatchEvent(new Event("input"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.menuPeak = 0;
  });
  await page.locator("#setup-next").tap();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.menuPeak), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Fresh portrait touch gesture unlocks decoded menu PCM; effects-volume zero remains silent",
    { peak },
  );
} finally {
  await browser.close();
}
