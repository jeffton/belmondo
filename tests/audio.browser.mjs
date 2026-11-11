import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.env.GAME_URL || "http://127.0.0.1:5178";
const artifactDirectory = "test-artifacts";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir(artifactDirectory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  // Tap the real game output, after compression. No autoplay-policy bypass.
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    window.audioTaps = [];
    window.AudioContext = class extends NativeContext {
      createDynamicsCompressor() {
        const compressor = super.createDynamicsCompressor();
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        compressor.connect(analyser);
        window.audioTaps.push({ context: this, analyser });
        return compressor;
      }
    };
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.nullVector?.telemetry.state === "menu",
  );
  await page.locator("#mode").selectOption("trial");
  await page.locator("#quality").selectOption("retro");
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.nullVector.telemetry.time > 0.2,
    {},
    { timeout: 30000 },
  );
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(700);
  async function rms() {
    await page.waitForTimeout(450);
    return page.evaluate(() => {
      const tap = window.audioTaps[0];
      if (!tap) throw new Error("Game did not build the effects output graph");
      const pcm = new Float32Array(tap.analyser.fftSize);
      tap.analyser.getFloatTimeDomainData(pcm);
      return Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
    });
  }
  const live = { racing: await rms() };
  assert(live.racing > 0.02, "Start gesture must unlock audible game PCM");
  await page.evaluate(() => {
    const mute = document.querySelector("#mute");
    mute.checked = true;
    mute.dispatchEvent(new Event("change"));
  });
  live.muted = await rms();
  assert(live.muted < 0.0001, "Muted game must be silent");
  await page.evaluate(() => {
    const mute = document.querySelector("#mute");
    mute.checked = false;
    mute.dispatchEvent(new Event("change"));
  });
  await page.keyboard.up("ArrowUp");
  await page.locator("#pause").click();
  live.paused = await rms();
  assert(live.paused < 0.0001, "Paused game must be silent");
  await page.locator("#resume").click();
  live.resumed = await rms();
  assert(live.resumed > 0.02, "Resume must restore PCM");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  live.blurred = await rms();
  assert(live.blurred < 0.0001, "Blur must silence game effects");
  await page.close();

  // Render local synthesis separately: test every family without gameplay timing.
  const synthesis = await browser.newPage();
  await synthesis.route("**/audio-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<button>Start audio</button>",
    }),
  );
  await synthesis.goto(`${url.replace(/\/$/, "")}/audio-check`);
  const source = await readFile(
    new URL("../src/audio.js", import.meta.url),
    "utf8",
  );
  await synthesis.addScriptTag({
    content:
      source.replaceAll("export class ", "class ") +
      "\nwindow.AudioEngineUnderTest = AudioEngine;",
  });
  const rendered = await synthesis.evaluate(async () => {
    const NativeContext = window.AudioContext;
    const cases = [
      ["hover", (a) => a.update(0, false)],
      ["speed", (a) => a.update(1, false)],
      ["airbrake", (a) => a.update(1, false, { air: 1 })],
      ["boost-loop", (a) => a.update(1, true)],
      ...[
        "countdown",
        "go",
        "pickup",
        "hit",
        "scrape",
        "boost",
        "jump",
        "land",
        "incoming",
        "lap",
        "finish",
      ].map((kind) => [kind, (a) => a.effect(kind)]),
      [
        "finish-transition",
        (a) => {
          a.update(1, false);
          a.effect("finish");
          a.stopEngine();
        },
      ],
      ...["MISSILE", "PULSE", "MINE", "SHIELD", "SURGE"].map((weapon) => [
        weapon,
        (a) => a.effect("fire", weapon),
      ]),
    ];
    const results = [];
    for (const [name, run] of cases) {
      const context = new OfflineAudioContext(1, 48000, 48000);
      // Offline contexts render via startRendering(), not realtime resume().
      context.resume = () => Promise.resolve();
      window.AudioContext = function () {
        return context;
      };
      const audio = new window.AudioEngineUnderTest();
      await audio.start();
      run(audio);
      const buffer = await context.startRendering();
      const pcm = buffer.getChannelData(0);
      let sum = 0,
        peak = 0;
      for (const sample of pcm) {
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      window.removeEventListener("blur", audio.onBlur);
      window.removeEventListener("focus", audio.onFocus);
      document.removeEventListener("visibilitychange", audio.onVisibility);
      results.push({
        name,
        rms: Math.sqrt(sum / pcm.length),
        peak,
        pcm: Array.from(pcm),
      });
    }
    window.AudioContext = NativeContext;
    return results;
  });
  for (const { name, rms, peak } of rendered) {
    console.log(`${name}: RMS ${rms.toFixed(4)}, peak ${peak.toFixed(4)}`);
    assert(rms > 0.003 && peak > 0.035, `${name} must render audible energy`);
    assert(peak < 0.98, `${name} must not clip`);
  }
  assert(
    rendered[1].rms > rendered[0].rms * 1.5,
    "Speed must audibly increase the engine",
  );
  assert(rendered[2].rms > rendered[1].rms, "Airbrake must add audible energy");
  const metrics = {
    url,
    live,
    cases: rendered.map(({ pcm, ...metrics }) => metrics),
  };
  await writeFile(
    `${artifactDirectory}/audio-metrics.json`,
    JSON.stringify(metrics, null, 2),
  );
  // One second per named case, with a quarter-second silent gap, in cases order.
  const frames = rendered.reduce(
    (n, result) => n + result.pcm.length + 12000,
    0,
  );
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  let position = 44;
  for (const result of rendered) {
    for (const sample of result.pcm) {
      wav.writeInt16LE(Math.round(clamp(sample) * 32767), position);
      position += 2;
    }
    position += 24000;
  }
  await writeFile(`${artifactDirectory}/audio-effects.wav`, wav);
  console.log("Live game PCM:", live);
} finally {
  await browser.close();
}
function clamp(sample) {
  return Math.max(-1, Math.min(1, sample));
}
