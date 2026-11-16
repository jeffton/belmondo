import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const url = process.env.GAME_URL || "http://127.0.0.1:5187";
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=document-user-activation-required",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
    hasTouch: true,
    // The diagnostic AudioWorklet uses a blob; production synthesis has no worklet.
    bypassCSP: true,
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error);
  });
  await page.addInitScript(() => {
    window.pad = null;
    window.padReads = 0;
    navigator.getGamepads = () => {
      window.padReads++;
      return window.pad ? [window.pad] : [];
    };
    window.cues = [];
    window.timing = [];
    window.peaks = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      createBufferSource() {
        const source = super.createBufferSource();
        const original = source.start.bind(source);
        source.start = (...args) => {
          const cues = new Map([
            [170, "move"],
            [256, "confirm"],
            [312, "back"],
          ]);
          const kind = cues.get(Math.round(source.buffer?.duration * 1000));
          if (kind) {
            window.cues.push(kind);
            window.timing.push([args[0] ?? this.currentTime, this.currentTime]);
          }
          return original(...args);
        };
        return source;
      }
      createDynamicsCompressor() {
        window.effectsContext = this;
        const compressor = super.createDynamicsCompressor();
        window.tapReady = this.audioWorklet
          .addModule(
            URL.createObjectURL(
              new Blob(
                [
                  `
            registerProcessor('peak-tap', class extends AudioWorkletProcessor {
              process(inputs) {
                const pcm = inputs[0]?.[0];
                if (pcm) this.port.postMessage(Math.max(...pcm.map(Math.abs)));
                return true;
              }
            });
          `,
                ],
                { type: "text/javascript" },
              ),
            ),
          )
          .then(() => {
            const tap = new AudioWorkletNode(this, "peak-tap");
            compressor.connect(tap);
            tap.connect(this.destination);
            tap.port.onmessage = ({ data }) => window.peaks.push(data);
          });
        return compressor;
      }
    };
  });
  await page.goto(url);
  const cdp = await page.context().newCDPSession(page);
  const untrusted = async (fn, arg) => {
    const response = await cdp.send("Runtime.evaluate", {
      expression: `(${fn.toString()})(${JSON.stringify(arg) ?? "undefined"})`,
      userGesture: false,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await untrusted(async () => {
    const deadline = performance.now() + 30000;
    while (!window.nullVector) {
      if (performance.now() > deadline) throw new Error("Menu failed to load");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  assert.equal(
    await untrusted(() => window.nullVector?.telemetry.state),
    "menu",
  );
  const storage = await untrusted(() => [
    localStorage.getItem("nv-records"),
    localStorage.getItem("nv-progression"),
  ]);
  const levels = [];
  async function action(expected, run, audible = expected.length > 0) {
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      window.cues = [];
      window.peaks = [];
    });
    await run();
    await page.waitForTimeout(450);
    const result = await page.evaluate(() => ({
      cues: window.cues,
      peak: Math.max(0, ...window.peaks),
      contextState: window.effectsContext?.state,
      samples: window.peaks.length,
      timing: window.timing,
    }));
    assert.deepEqual(result.cues, expected);
    levels.push({ cues: result.cues, peak: result.peak });
    if (audible === null) return result;
    if (audible)
      assert(
        result.peak > 0.0001 && result.peak < 0.65,
        JSON.stringify(result),
      );
    else assert(result.peak < 0.0001, JSON.stringify(result));
    return result;
  }
  // Polling a controller before activation must not queue stale audio.
  // CDP explicitly avoids Playwright evaluate's implicit userGesture flag.
  await untrusted(() => {
    window.pad = {
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      mapping: "standard",
      connected: true,
      index: 0,
      id: "locked-test",
    };
  });
  const waitUntrusted = async (predicate) => {
    await untrusted(async (source) => {
      const check = new Function(`return (${source})()`);
      const deadline = performance.now() + 10000;
      while (!check()) {
        if (performance.now() > deadline)
          throw new Error(`Timed out: ${source}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }, predicate.toString());
  };
  await waitUntrusted(() => document.body.dataset.gamepadConnected === "true");
  for (const button of [0, 1]) {
    await untrusted((index) => {
      window.pad.buttons[index] = { pressed: true, value: 1 };
    }, button);
    await waitUntrusted(
      button === 0
        ? () => window.nullVector.telemetry.menuStage === "class"
        : () => window.nullVector.telemetry.menuStage === "mode",
    );
    await untrusted((index) => {
      window.pad.buttons[index] = { pressed: false, value: 0 };
    }, button);
    const reads = await untrusted(() => window.padReads);
    await waitUntrusted(new Function(`return window.padReads > ${reads + 1}`));
  }
  assert.deepEqual(await untrusted(() => window.cues), []);
  assert.equal(
    await untrusted(() => window.effectsContext?.state),
    "suspended",
  );
  await untrusted(() => {
    window.pad = null;
    return window.tapReady;
  });
  // First real gesture must unlock actual output, without replaying controller cues.
  await action(["move"], () =>
    page.locator('input[name="mode"][value="trial"]').check(),
  );
  await page.evaluate(() => window.tapReady);
  await action([], () => page.locator("#music-open").hover());
  await action([], () =>
    page.locator('input[name="mode"][value="trial"]').click(),
  );
  await action(["confirm"], () => page.locator("#setup-next").tap());
  await action(["back"], () => page.keyboard.press("Escape"));
  await page.locator('input[name="mode"][value="race"]').click();
  await action(["move"], () => page.keyboard.press("ArrowRight"));
  await page.locator('input[name="mode"][value="trial"]').click();
  await action([], () => page.keyboard.press("Escape"));
  await action(["confirm"], () => page.keyboard.press("Enter"));
  await action(["confirm"], () => page.locator("#music-open").tap());
  await action(["back"], () => page.keyboard.press("Enter"));
  // Real polling path with standard mapped controller button edges.
  await page.evaluate(() => {
    window.pad = {
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      mapping: "standard",
      connected: true,
      index: 0,
      id: "test",
    };
  });
  await page.waitForTimeout(80);
  async function pad(button) {
    await page.evaluate((index) => {
      window.pad.buttons[index] = { pressed: true, value: 1 };
    }, button);
    await page.waitForTimeout(180);
    await page.evaluate((index) => {
      window.pad.buttons[index] = { pressed: false, value: 0 };
    }, button);
  }
  await action(["move"], () => pad(15));
  await action(["confirm"], () => pad(0));
  await action(["back"], () => pad(1));
  await page.evaluate(() => {
    window.pad = null;
  });
  await page.locator("#music-open").click();
  await page.locator("#effects-volume").fill("0");
  await action([], () => page.locator("#music-dialog .close").tap(), false);
  await action([], () => page.locator("#setup-back").tap(), false);
  await page.locator("#music-open").tap();
  await page.locator("#effects-volume").fill("0.7");
  await action(["back"], () => page.locator("#music-dialog .close").tap());
  // Start and pause use the same output; paused race bus must not mute menu bus.
  for (let i = 0; i < 3; i++) await page.locator("#setup-next").click();
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.state === "race",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await action(["confirm"], () => page.locator("#pause-music").tap());
  await action(["back"], () => page.keyboard.press("Escape"));
  await action(["move"], () => page.keyboard.press("ArrowDown"));
  await action(["confirm"], () => page.locator("#quit").tap());
  assert.deepEqual(
    await page.evaluate(() => [
      localStorage.getItem("nv-records"),
      localStorage.getItem("nv-progression"),
    ]),
    storage,
  );
  assert.deepEqual(errors, []);
  console.log("Realtime menu peaks:", levels);
  console.log(
    "Menu audio PASS: gesture-unlocked PCM; keyboard/gamepad/touch; no-op/hover; transitions/dialog/pause; zero volume; records unchanged",
  );
} finally {
  await browser.close();
}
