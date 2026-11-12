import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createShuffleBag, soundtrack } from "../src/soundtrack.js";

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("soundtrack bags play every track exactly once without seam repeats", () => {
  for (const count of [2, 3, 8]) {
    for (const random of [() => 0, () => 0.999999, seededRandom(123)]) {
      const bag = createShuffleBag(count, random);
      let previous = -1;
      for (let cycle = 0; cycle < 20; cycle++) {
        const played = Array.from({ length: count }, () => bag.next().value);
        assert.equal(new Set(played).size, count);
        assert.notEqual(played[0], previous);
        assert(played.every((index) => index >= 0 && index < count));
        previous = played.at(-1);
      }
    }
  }
});

test("empty and single-track playlists terminate or repeat naturally", () => {
  assert.equal(createShuffleBag(0).next().done, true);
  const single = createShuffleBag(1);
  assert.deepEqual([single.next().value, single.next().value], [0, 0]);
});

test("replacing the soundtrack preserves the archived approved Lyria masters", async () => {
  assert.equal(soundtrack.length, 8);
  const hashes = await Promise.all(
    ["phase-index", "glass-current", "ion-drift"].map(async (name) => {
      const bytes = await readFile(
        new URL(
          `../archive/music/lyria-2026-11-11/${name}.mp3`,
          import.meta.url,
        ),
      );
      return createHash("sha256").update(bytes).digest("hex");
    }),
  );
  assert.deepEqual(hashes, [
    "832001f1d36405e4a0d9ae59b0358d55955af3dc48b345281c4fa9cb3af138e1",
    "8bc2d82c22cde17348e72bea43b04b0ce5fdae16363c84c1d43643f724a991d4",
    "e3cb1faed3580436dac5622c04e6d9126973fa001ea3dd89be14c6ff936ae667",
  ]);
});
