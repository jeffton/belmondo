import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { SFX_CUES } from "../src/generated-sfx.js";

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
  await page.locator('input[name="mode"][value="trial"]').check();
  await page.locator("#quality").check();
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
  const engineSource = await readFile(
    new URL("../src/engine-sound.js", import.meta.url),
    "utf8",
  );
  await synthesis.addScriptTag({
    content:
      `const SFX_CUES = ${JSON.stringify(SFX_CUES)};\n` +
      // Keep module scopes separate: both modules have their own clamp helper.
      "const { createEngineBed, updateEngineSound } = (() => {\n" +
      engineSource.replaceAll("export function ", "function ") +
      "\nreturn { createEngineBed, updateEngineSound }; })();\n" +
      source
        .replace(/^import[^\n]*\n/gm, "")
        .replaceAll("export class ", "class ") +
      "\nwindow.AudioEngineUnderTest = AudioEngine;",
  });
  // Record the actual realtime bus, including continuously changing blade rate.
  // ScriptProcessor is only a test tap; production uses native buffer sources.
  await synthesis.evaluate(() => {
    document.querySelector("button").onclick = () => {
      window.recording = (async () => {
        const audio = new window.AudioEngineUnderTest();
        await audio.start();
        const context = audio.context;
        const rate = context.sampleRate;
        const channels = [
          new Float32Array(rate * 14),
          new Float32Array(rate * 14),
        ];
        const tap = context.createScriptProcessor(2048, 2, 2);
        const startAt = context.currentTime;
        audio.compressor.connect(tap);
        tap.connect(context.destination);
        tap.onaudioprocess = (event) => {
          const offset = Math.round((event.playbackTime - startAt) * rate);
          for (let channel = 0; channel < 2; channel++) {
            const input = event.inputBuffer.getChannelData(channel);
            for (let i = 0; i < input.length; i++) {
              const index = offset + i;
              if (index >= 0 && index < channels[channel].length)
                channels[channel][index] = input[i];
            }
          }
        };
        let finished = false;
        await new Promise((resolve) => {
          const timer = setInterval(() => {
            const t = context.currentTime - startAt;
            if (t < 1) audio.update(0, false, { acceleration: 0 });
            else if (t < 4)
              audio.update((t - 1) / 3, false, {
                acceleration: 125 / 3,
                throttle: true,
              });
            else if (t < 5.5) audio.update(1, false, { acceleration: 0 });
            else if (t < 7)
              audio.update(1 - (t - 5.5) * 0.4, false, {
                acceleration: -50,
                air: 0.8,
                brake: true,
              });
            else if (t < 9)
              audio.update(0.4 + (t - 7) * 0.425, true, {
                acceleration: 53,
                throttle: true,
              });
            else if (t < 10)
              audio.update(1.1, false, {
                acceleration: -18,
                grounded: false,
                slip: 6,
              });
            else if (!finished) {
              audio.stopEngine();
              audio.effect("finish", 1);
              finished = true;
            }
            if (t >= 13.2) {
              clearInterval(timer);
              resolve();
            }
          }, 20);
        });
        tap.disconnect();
        audio.compressor.disconnect(tap);
        await audio.dispose();
        return {
          rate,
          channels: channels.map((channel) =>
            Array.from(channel.slice(0, rate * 13.2)),
          ),
        };
      })();
    };
  });
  await synthesis.locator("button").click();
  const recording = await synthesis.evaluate(() => window.recording);
  const sequence = [
    ["idle", 0.3, 0.9],
    ["acceleration", 2, 3.7],
    ["cruise", 4.4, 5.3],
    ["airbraking", 5.9, 6.8],
    ["boost", 7.6, 8.9],
    ["airborne", 9.4, 9.8],
    ["finish", 10.1, 10.6],
    ["finished-silence", 12.3, 13],
  ].map(([name, start, end]) => ({
    name,
    ...measure(
      recording.channels[0].slice(
        Math.round(start * recording.rate),
        Math.round(end * recording.rate),
      ),
      recording.rate,
    ),
    right: measure(
      recording.channels[1].slice(
        Math.round(start * recording.rate),
        Math.round(end * recording.rate),
      ),
      recording.rate,
    ),
  }));
  for (const section of sequence) {
    assert(
      section.peak < 0.98 && section.right.peak < 0.98,
      section.name + " must not clip either channel",
    );
    if (section.name !== "finished-silence")
      assert(section.rms > 0.005, section.name + " must be audible");
  }
  assert(
    sequence[7].rms < 0.0001 && sequence[7].right.rms < 0.0001,
    "Finish must drain both engine channels",
  );
  assert(
    sequence[2].centroid > sequence[0].centroid * 1.5,
    "Turbine spectrum must open from idle to cruise",
  );
  const cruiseStart = Math.round(4.4 * recording.rate);
  const cruiseEnd = Math.round(5.3 * recording.rate);
  const stereoDifference = measure(
    recording.channels[0]
      .slice(cruiseStart, cruiseEnd)
      .map((sample, i) => sample - recording.channels[1][cruiseStart + i]),
    recording.rate,
  ).rms;
  assert(stereoDifference > 0.003, "Stereo beds must not be duplicate mono");
  assert(
    sequence[2].rms > sequence[0].rms * 1.3,
    "Cruise must develop from idle",
  );
  assert(
    sequence[2].bands.air > 0.005,
    "Cruise must contain airflow, not only a bass oscillator",
  );
  assert(
    sequence[2].bands.bass > 0.05,
    "Cruise must retain a physical low body",
  );
  await writeFile(
    `${artifactDirectory}/audio-engine-drive.wav`,
    wave(recording.channels, recording.rate),
  );
  console.log("Recorded drive sequence:", sequence);
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
      ].map((kind) => [
        kind,
        (a) =>
          a.effect(
            kind,
            kind === "finish"
              ? 1
              : kind === "lap"
                ? 2
                : kind === "pickup"
                  ? "MISSILE"
                  : undefined,
          ),
      ]),
      [
        "finish-transition",
        (a) => {
          a.update(1, false);
          a.effect("finish", 1);
          a.stopEngine();
        },
      ],
      ...["MISSILE", "PULSE", "MINE", "SHIELD", "TURBO"].map((weapon) => [
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
    sequence,
    stereoDifference,
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

function wave(channels, rate) {
  const frames = channels[0].length;
  const count = channels.length;
  const wav = Buffer.alloc(44 + frames * count * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(count, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * count * 2, 28);
  wav.writeUInt16LE(count * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * count * 2, 40);
  let position = 44;
  for (let frame = 0; frame < frames; frame++)
    for (const channel of channels) {
      wav.writeInt16LE(Math.round(clamp(channel[frame]) * 32767), position);
      position += 2;
    }
  return wav;
}

function measure(pcm, rate) {
  const rms = Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
  const peak = pcm.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
  const size = 2048;
  const energy = new Float64Array(size / 2);
  for (let offset = 0; offset + size <= pcm.length; offset += size) {
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    for (let i = 0; i < size; i++)
      real[i] =
        pcm[offset + i] *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [real[i], real[j]] = [real[j], real[i]];
    }
    for (let length = 2; length <= size; length *= 2)
      for (let start = 0; start < size; start += length)
        for (let k = 0; k < length / 2; k++) {
          const angle = (-2 * Math.PI * k) / length;
          const even = start + k,
            odd = even + length / 2;
          const r =
            real[odd] * Math.cos(angle) - imaginary[odd] * Math.sin(angle);
          const im =
            real[odd] * Math.sin(angle) + imaginary[odd] * Math.cos(angle);
          real[odd] = real[even] - r;
          imaginary[odd] = imaginary[even] - im;
          real[even] += r;
          imaginary[even] += im;
        }
    for (let bin = 1; bin < energy.length; bin++)
      energy[bin] += real[bin] ** 2 + imaginary[bin] ** 2;
  }
  const ranges = {
    bass: [20, 180],
    body: [180, 800],
    air: [800, 4000],
    hiss: [4000, 12000],
  };
  const bands = Object.fromEntries(
    Object.entries(ranges).map(([name, [low, high]]) => [
      name,
      energy.reduce(
        (sum, value, bin) =>
          sum +
          ((bin * rate) / size >= low && (bin * rate) / size < high
            ? value
            : 0),
        0,
      ),
    ]),
  );
  const total = Object.values(bands).reduce((sum, x) => sum + x, 0);
  if (total > 0) for (const name in bands) bands[name] /= total;
  let bassEnergy = 0,
    bassWeighted = 0;
  for (let bin = 1; bin < energy.length && (bin * rate) / size < 180; bin++) {
    if ((bin * rate) / size >= 20) {
      bassEnergy += energy[bin];
      bassWeighted += (energy[bin] * bin * rate) / size;
    }
  }
  const bassCentroid = bassEnergy > 0 ? bassWeighted / bassEnergy : 0;
  const spectralEnergy = energy.reduce((sum, value) => sum + value, 0);
  const centroid =
    spectralEnergy > 0
      ? energy.reduce(
          (sum, value, bin) => sum + value * ((bin * rate) / size),
          0,
        ) / spectralEnergy
      : 0;
  return { rms, peak, bands, bassCentroid, centroid };
}
