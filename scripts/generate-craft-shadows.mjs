// Offline orthographic union of the actual hull triangles, not a drawn outline.
// Run: node scripts/generate-craft-shadows.mjs [--check]
import { buildHull } from "../src/craft.ts";
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZE = 256;
const SAMPLES = 4;
const PADDING = 0.65; // Hull-local units; protects the soft edge and mip levels.
const PARTS = ["core", "accent", "mechanical", "canopy"];
const NAMES = ["STRIKER", "RAPTOR", "WRAITH"];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function png(alpha) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6; // RGBA: white RGB, silhouette in alpha for runtime tinting.
  const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
      rows.fill(255, offset, offset + 3);
      rows[offset + 3] = alpha[y * SIZE + x];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function generateShadow(variant) {
  const hull = buildHull(variant);
  const triangles = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const part of PARTS) {
    const geometry = hull[part];
    const positions = geometry.getAttribute("position");
    const count = geometry.index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const triangle = [];
      for (let j = 0; j < 3; j++) {
        const index = geometry.index?.getX(i + j) ?? i + j;
        const x = positions.getX(index);
        const z = positions.getZ(index);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        triangle.push([x, z]);
      }
      triangles.push(triangle);
    }
    geometry.dispose();
  }
  const hullBounds = { minX, maxX, minZ, maxZ };
  minX -= PADDING;
  maxX += PADDING;
  minZ -= PADDING;
  maxZ += PADDING;
  const resolution = SIZE * SAMPLES;
  const coverage = new Uint8Array(resolution * resolution);
  const edge = (a, b, x, y) =>
    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  for (const triangle of triangles) {
    const points = triangle.map(([x, z]) => [
      ((x - minX) / (maxX - minX)) * resolution,
      ((maxZ - z) / (maxZ - minZ)) * resolution,
    ]);
    const [a, b, c] = points;
    const area = edge(a, b, ...c);
    if (Math.abs(area) < 1e-10) continue; // Vertical faces have no top-down area.
    const sign = Math.sign(area);
    const left = Math.max(0, Math.floor(Math.min(...points.map((p) => p[0]))));
    const right = Math.min(
      resolution - 1,
      Math.ceil(Math.max(...points.map((p) => p[0]))),
    );
    const top = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
    const bottom = Math.min(
      resolution - 1,
      Math.ceil(Math.max(...points.map((p) => p[1]))),
    );
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (
          sign * edge(a, b, x + 0.5, y + 0.5) >= 0 &&
          sign * edge(b, c, x + 0.5, y + 0.5) >= 0 &&
          sign * edge(c, a, x + 0.5, y + 0.5) >= 0
        )
          coverage[y * resolution + x] = 1;
      }
    }
  }
  const averaged = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0;
      for (let sy = 0; sy < SAMPLES; sy++)
        for (let sx = 0; sx < SAMPLES; sx++)
          sum += coverage[(y * SAMPLES + sy) * resolution + x * SAMPLES + sx];
      averaged[y * SIZE + x] = (255 * sum) / (SAMPLES * SAMPLES);
    }
  }
  // Compact separable Gaussian: soften aliasing without losing the airframe shape.
  const weights = Array.from({ length: 7 }, (_, i) =>
    Math.exp(-((i - 3) ** 2) / (2 * 1.25 ** 2)),
  );
  const total = weights.reduce((a, b) => a + b);
  const horizontal = new Float64Array(SIZE * SIZE);
  const alpha = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (let i = -3; i <= 3; i++) {
        if (x + i >= 0 && x + i < SIZE)
          horizontal[y * SIZE + x] +=
            (averaged[y * SIZE + x + i] * weights[i + 3]) / total;
      }
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let value = 0;
      for (let i = -3; i <= 3; i++) {
        if (y + i >= 0 && y + i < SIZE)
          value += (horizontal[(y + i) * SIZE + x] * weights[i + 3]) / total;
      }
      alpha[y * SIZE + x] = Math.round(value);
    }
  }
  return {
    png: png(alpha),
    alpha,
    metadata: {
      variant,
      name: NAMES[variant],
      file: `craft-shadow-${variant}.png`,
      hullBounds,
      bounds: { minX, maxX, minZ, maxZ },
      width: maxX - minX,
      length: maxZ - minZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      triangles: triangles.length,
    },
  };
}

export async function generateAssets({ check = false } = {}) {
  const shadows = NAMES.map((_, variant) => generateShadow(variant));
  const metadata = {
    size: SIZE,
    projection: "orthographic along -Y; hull-local X/Z, +Z is nose",
    image:
      "left=minX, right=maxX, top=maxZ, bottom=minZ; white RGB, coverage alpha",
    uv: "u=(x-minX)/width; v=(z-minZ)/length with Three.js Texture.flipY=true",
    parts: PARTS,
    shadows: shadows.map((shadow) => shadow.metadata),
  };
  const outputs = shadows.map((shadow) => [shadow.metadata.file, shadow.png]);
  outputs.push([
    "craft-shadows.json",
    Buffer.from(JSON.stringify(metadata, null, 2) + "\n"),
  ]);
  const runtimeMetadata = shadows.map(({ metadata: shadow }) => ({
    path: `/art/${shadow.file}`,
    ...shadow.bounds,
  }));
  const runtimeSource = Buffer.from(
    "// Generated by scripts/generate-craft-shadows.mjs; do not edit.\n" +
      "// Local X/Z bounds including transparent padding; image top is +Z.\n" +
      "export const CRAFT_SHADOW_MASKS = [\n" +
      runtimeMetadata
        .map(
          (mask) =>
            "  {\n" +
            Object.entries(mask)
              .map(([key, value]) => `    ${key}: ${JSON.stringify(value)},\n`)
              .join("") +
            "  },\n",
        )
        .join("") +
      "] as const;\n",
  );
  outputs.push(["../../src/craft-shadow-masks.ts", runtimeSource]);
  for (const [file, data] of outputs) {
    const url = new URL(`../public/art/${file}`, import.meta.url);
    if (check) {
      if (!data.equals(await readFile(url)))
        throw new Error(`Stale generated asset: ${file}`);
    } else await writeFile(url, data);
  }
  return metadata;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metadata = await generateAssets({
    check: process.argv.includes("--check"),
  });
  console.log(
    `Craft shadows ${process.argv.includes("--check") ? "verified" : "generated"}: ${metadata.shadows.map((s) => s.name).join(", ")}`,
  );
}
