import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createEngineBed, updateEngineSound } from "../src/engine-sound.js";

const context = {
  createBuffer(channels, length, sampleRate) {
    const pcm = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: (i) => pcm[i],
    };
  },
};

function spectrum(pcm) {
  const size = 4096;
  const power = [];
  for (let bin = 1; bin < 700; bin++) {
    let total = 0;
    for (const offset of [12000, 24000, 48000]) {
      let real = 0,
        imaginary = 0;
      for (let i = 0; i < size; i++) {
        const angle = (2 * Math.PI * bin * i) / size;
        const value =
          pcm[offset + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
        real += value * Math.cos(angle);
        imaginary += value * Math.sin(angle);
      }
      total += real * real + imaginary * imaginary;
    }
    power.push(total);
  }
  const sum = power.reduce((a, b) => a + b, 0);
  return {
    concentration:
      Math.max(
        ...power.map((p, i) => p + (power[i - 1] || 0) + (power[i + 1] || 0)),
      ) / sum,
    centroid:
      power.reduce((a, p, i) => a + p * (((i + 1) * 24000) / size), 0) / sum,
  };
}

test("engine beds are broad mechanical pressure/air, not a sustained musical carrier", () => {
  const spectra = [];
  for (const turbine of [false, true]) {
    const buffer = createEngineBed(context, turbine);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    assert(left.every(Number.isFinite));
    assert(Math.max(...left.map(Math.abs)) < 1, "PCM must not clip");
    const rms = Math.sqrt(
      left.reduce((sum, x) => sum + x * x, 0) / left.length,
    );
    assert(rms > 0.08 && rms < 0.5, "usable headroom without near-silence");
    const dot = left.reduce((sum, x, i) => sum + x * right[i], 0);
    const energy = Math.sqrt(
      left.reduce((s, x) => s + x * x, 0) *
        right.reduce((s, x) => s + x * x, 0),
    );
    assert(Math.abs(dot / energy) < 0.2, "independent stereo texture");
    const step = Math.sqrt(
      left.slice(1).reduce((sum, x, i) => sum + (x - left[i]) ** 2, 0) /
        (left.length - 1),
    );
    assert(
      Math.abs(left[0] - left.at(-1)) < step * 3,
      "loop boundary must resemble an ordinary sample step",
    );
    const measured = spectrum(left);
    assert(
      measured.concentration < 0.22,
      "no narrow three-bin carrier dominating the spectrum",
    );
    spectra.push(measured);
  }
  assert(
    spectra[1].centroid > spectra[0].centroid * 2,
    "separate low pressure and high turbine bands",
  );
});

function layer() {
  const param = () => ({
    value: 0,
    setTargetAtTime(value) {
      this.value = value;
    },
  });
  return {
    source: { playbackRate: param() },
    gain: { gain: param() },
    filter: { frequency: param() },
  };
}

test("coasting unloads the engine at equal speed; boost and air change its pressure", () => {
  const motor = layer(),
    turbine = layer();
  const sample = (controls, boost = 0, load = 0) => {
    updateEngineSound(motor, turbine, 0, 1, boost, load, controls);
    return [
      motor.gain.gain.value,
      turbine.gain.gain.value,
      turbine.filter.frequency.value,
      turbine.source.playbackRate.value,
    ];
  };
  const coast = sample({ throttle: false });
  const drive = sample({ throttle: true });
  const boost = sample({ throttle: true }, 1, 1);
  const air = sample({ throttle: true, grounded: false });
  assert(drive[0] > coast[0] * 1.2);
  assert(drive[1] > coast[1]);
  assert(boost.every((value, i) => value > drive[i]));
  assert(air[0] < drive[0] && air[1] === drive[1]);
});

// Explicit user invariant: these exact original noise/airbrake implementation
// regions are unchanged, including random seed, filter, gain and smoothing.
test("approved airbrake synthesis and automation remain byte-identical", () => {
  const source = readFileSync(
    new URL("../src/audio.js", import.meta.url),
    "utf8",
  );
  const sections = [
    source.match(/    this\.noise =[\s\S]*?\n    }/)[0],
    source.match(/    this\.brake =[^\n]+/)[0],
    source.slice(source.indexOf("  loopNoise("), source.indexOf("  update(")),
    source.slice(source.indexOf("  update(")).match(/    const air =[^\n]+/)[0],
    source.slice(
      source.indexOf("    target(\n      this.brake.gain.gain"),
      source.indexOf("    target(this.boost.gain.gain"),
    ),
  ];
  const hash = createHash("sha256").update(sections.join("\n")).digest("hex");
  assert.equal(
    hash,
    "b60d3b426f337530e8a4f55c1ff8ecaa3240912c76a0846b8c9f8f0a39b7eb09",
  );
});
