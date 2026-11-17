import test from "node:test";
import assert from "node:assert/strict";
import { buildHull } from "../src/craft.ts";
import {
  generateAssets,
  generateShadow,
} from "../scripts/generate-craft-shadows.mjs";

test("committed shadow masks reproduce from current hull geometry", async () => {
  await generateAssets({ check: true });
});

test("all hull parts fit the recorded projection; masks retain distinct airframes", () => {
  const masks = [];
  for (let variant = 0; variant < 3; variant++) {
    const { alpha, metadata } = generateShadow(variant);
    const { bounds, hullBounds } = metadata;
    const hull = buildHull(variant);
    const xs = [];
    const zs = [];
    for (const geometry of Object.values(hull)) {
      const position = geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        xs.push(position.getX(i));
        zs.push(position.getZ(i));
      }
      geometry.dispose();
    }
    assert.deepEqual(hullBounds, {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    });
    assert.ok(bounds.minX < hullBounds.minX && bounds.maxX > hullBounds.maxX);
    assert.ok(bounds.minZ < hullBounds.minZ && bounds.maxZ > hullBounds.maxZ);
    const occupied = [...alpha].filter((a) => a > 127).length;
    assert.ok(occupied > 256 * 256 * 0.15 && occupied < 256 * 256 * 0.6);
    assert.ok(alpha.includes(255), "solid hull interior");
    assert.ok(
      alpha.some((a) => a > 0 && a < 255),
      "antialiased soft contour",
    );
    for (let i = 0; i < 256; i++) {
      assert.equal(alpha[i], 0);
      assert.equal(alpha[255 * 256 + i], 0);
      assert.equal(alpha[i * 256], 0);
      assert.equal(alpha[i * 256 + 255], 0);
    }
    // Geometry and raster are symmetric about local X=0, including swept foils.
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 128; x++)
        assert.ok(Math.abs(alpha[y * 256 + x] - alpha[y * 256 + 255 - x]) <= 1);
    }
    // The narrow forward fuselage must appear above the wide rear wings.
    const forward = [...alpha.slice(60 * 256, 61 * 256)].filter(
      (a) => a > 127,
    ).length;
    const rear = [...alpha.slice(180 * 256, 181 * 256)].filter(
      (a) => a > 127,
    ).length;
    assert.ok(rear > forward * 2, "nose points toward image top");
    masks.push(Buffer.from(alpha));
  }
  for (let a = 0; a < masks.length; a++)
    for (let b = a + 1; b < masks.length; b++)
      assert.ok(
        !masks[a].equals(masks[b]),
        "different hulls retain distinct silhouettes",
      );
});
