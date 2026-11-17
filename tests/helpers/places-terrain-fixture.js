import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Exact parent integration, usable by Node checks and the private Vite QA
 * plugin. Grading, whole-cell clearance, renderer and queries are unchanged.
 * Remove the fixture once the parent integrates these calls in terrain.ts.
 */
export function integratePlacesTerrainSource(source) {
  function replace(old, next) {
    assert.equal(
      source.split(old).length,
      2,
      `terrain integration needs exactly one: ${old}`,
    );
    source = source.replace(old, next);
  }
  replace(
    '  const harbor = track.config.name === "NOCTILUCENT";',
    '  const harbor = track.config.name === "NOCTILUCENT";\n  const harborBasin = createNightHarborBasin(track);\n  const cinderWorks = createCinderWorksLandform(track);\n  const cinderRidge = createCinderRidgeLandform(track);',
  );
  replace(
    "base = -25 + (1 - smooth(0.85, 1.15, r)) * 66;",
    "base = nightHarborBaseHeight(harborBasin, x, z, -25 + (1 - smooth(0.85, 1.15, r)) * 66);",
  );
  replace(
    "    } else if (desert) {",
    '      if (recipe.biome === "volcanic") base = cinderRidgeBaseHeight(cinderRidge, x, z, base);\n    } else if (desert) {',
  );
  replace(
    "    return y;\n  }\n  const heights",
    '    if (recipe?.biome === "volcanic") y = cinderWorksLandHeight(cinderWorks, x, z, y);\n    return y;\n  }\n  const heights',
  );
  return (
    'import { createNightHarborBasin, nightHarborBaseHeight } from "./night-harbor.ts";\nimport { createCinderWorksLandform, cinderWorksLandHeight, createCinderRidgeLandform, cinderRidgeBaseHeight } from "./cinder-works.ts";\n' +
    source
  );
}

export async function placesTerrainFixture() {
  const src = new URL("../../src/", import.meta.url);
  let source = integratePlacesTerrainSource(
    await readFile(new URL("terrain.ts", src), "utf8"),
  );
  source = source
    .replaceAll('"./', `"${src.href}`)
    .replaceAll('"three"', JSON.stringify(import.meta.resolve("three")));
  const dir = await mkdtemp(join(tmpdir(), "belmondo-places-terrain-"));
  const file = join(dir, "terrain.ts");
  await writeFile(file, source);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true });
  }
}
