import * as THREE from "three";
import { getWaterfrontDistricts } from "./course-geography.js";
import {
  newCourseRecipe,
  assertKnownEnvironment,
  biomeLandHeight,
} from "./new-course-recipes.js";

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const STEP = 23;

/** Sink the transformed lower silhouette into the actual land, including slopes. */
export function groundedGeometryOffset(
  geometry,
  matrix,
  heightAt,
  embed = 1.2,
) {
  const positions = geometry.attributes.position;
  const points = [];
  let bottom = Infinity,
    top = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(matrix);
    points.push(p);
    bottom = Math.min(bottom, p.y);
    top = Math.max(top, p.y);
  }
  const feet = points.filter((p) => p.y <= bottom + (top - bottom) * 0.2);
  return Math.min(...feet.map((p) => heightAt(p.x, p.z) - p.y)) - embed;
}

/** One indexed surface is shared by scenery foundations and the rendered land. */
export function createTerrain(track) {
  assertKnownEnvironment(track);
  const recipe = newCourseRecipe(track);
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const samples = [];
  const count = Math.ceil(track.length / 7);
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const branches =
      u > track.config.split[0] && u < track.config.split[1] ? [-1, 1] : [0];
    for (const branch of branches)
      samples.push({ ...track.frame(u * track.length, branch), branch });
  }
  const minX = Math.min(...samples.map((f) => f.p.x));
  const maxX = Math.max(...samples.map((f) => f.p.x));
  const minZ = Math.min(...samples.map((f) => f.p.z));
  const maxZ = Math.max(...samples.map((f) => f.p.z));
  const EXTENT =
    Math.ceil((Math.max(-minX, maxX, -minZ, maxZ) + 350) / (STEP * 10)) *
    STEP *
    10;
  const CELLS = (EXTENT * 2) / STEP;
  const STRIDE = CELLS + 1;
  const centerX = (minX + maxX) / 2,
    centerZ = (minZ + maxZ) / 2;
  const radiusX = (maxX - minX) / 2 + 300,
    radiusZ = (maxZ - minZ) / 2 + 300;
  const upperBridge = track.config.sections.upperBridge;
  const onUpperBridge = (u) =>
    upperBridge && u >= upperBridge[0] && u <= upperBridge[1];
  const crossings = (
    recipe ? [] : harbor ? [0.135, 0.5] : desert ? [] : [0.215]
  ).map((u) => {
    const f = track.frame(u * track.length);
    return {
      p: f.p,
      forward: new THREE.Vector2(f.tangent.x, f.tangent.z).normalize(),
    };
  });
  function waterway(x, z) {
    let cut = 0;
    for (const f of crossings) {
      const along = Math.abs(
        (x - f.p.x) * f.forward.x + (z - f.p.z) * f.forward.y,
      );
      const across = Math.abs(
        (x - f.p.x) * f.forward.y - (z - f.p.z) * f.forward.x,
      );
      cut = Math.max(
        cut,
        (1 - smooth(24, 60, along)) * (1 - smooth(230, 350, across)),
      );
    }
    return cut;
  }
  const jump =
    track.config.jump === null
      ? null
      : track.frame(
          (track.config.jump + track.config.gapLength / 2) * track.length,
        );
  const ravineHalfLength = jump
    ? (track.config.gapLength * track.length) / 2 + 12
    : null;
  const jumpForward = jump
    ? new THREE.Vector2(jump.tangent.x, jump.tangent.z).normalize()
    : null;
  function ravine(x, z) {
    if (!jump) return 0;
    const along = Math.abs(
      (x - jump.p.x) * jumpForward.x + (z - jump.p.z) * jumpForward.y,
    );
    const across = Math.abs(
      (x - jump.p.x) * jumpForward.y - (z - jump.p.z) * jumpForward.x,
    );
    return (
      (1 - smooth(ravineHalfLength, ravineHalfLength + 60, along)) *
      (1 - smooth(100, 230, across))
    );
  }
  function nearest(x, z) {
    let best = samples[0],
      distance2 = Infinity;
    for (const f of samples) {
      const d = (x - f.p.x) ** 2 + (z - f.p.z) ** 2;
      if (d < distance2) {
        distance2 = d;
        best = f;
      }
    }
    return { frame: best, distance: Math.sqrt(distance2) };
  }
  function landHeight(x, z) {
    const { frame: f, distance } = nearest(x, z);
    const r = Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ);
    let base;
    if (recipe) {
      base = biomeLandHeight(recipe, x, z, {
        centerX,
        centerZ,
        radiusX,
        radiusZ,
        distance,
        roadY: f.p.y,
      });
    } else if (desert) {
      const strata = 12 * Math.sin(z * 0.006 + x * 0.002);
      const mesa = smooth(80, 170, distance) * (1 - smooth(350, 650, distance));
      base =
        40 + strata + mesa * (65 + 45 * Math.sin(x * 0.004 - z * 0.003) ** 2);
    } else if (harbor) {
      base = -25 + (1 - smooth(0.85, 1.15, r)) * 66;
    } else {
      const island = 1 - smooth(0.74, 1.05, r);
      const headland = (1 - smooth(0.2, 0.8, r)) * 64;
      base = -27 + island * 76 + headland + 8 * Math.sin(z * 0.006) * island;
    }
    // Broad graded land carries the course, rather than a thin ribbon on columns.
    const grade =
      recipe?.biome === "metropolis" || onUpperBridge(f.u)
        ? 0
        : 1 - smooth(desert ? 75 : 65, desert ? 240 : 190, distance);
    const fill =
      f.p.y - (f.up.x * (x - f.p.x) + f.up.z * (z - f.p.z)) / f.up.y - 4.5;
    let y = THREE.MathUtils.lerp(base, fill, grade);
    // Higher ground outside the shoulder forms real cuttings, not floating rock walls.
    if (distance > f.width + 38) y = Math.max(y, base);
    const cut = Math.max(waterway(x, z), ravine(x, z));
    y = THREE.MathUtils.lerp(y, desert ? 15 : -25, cut);
    if (recipe?.biome === "hydraulic") {
      const [start, end] = track.config.sections.dryLock;
      // Excavated reservoir shelves stay below the retained local water, while
      // the dry road remains lower still. No water is placed on the deck.
      if (f.u >= start - 0.015 && f.u <= end + 0.015 && distance < 145)
        y = Math.min(y, f.p.y + 16);
    }
    return y;
  }
  const heights = new Float32Array(STRIDE * STRIDE);
  for (let iz = 0; iz <= CELLS; iz++)
    for (let ix = 0; ix <= CELLS; ix++) {
      heights[iz * STRIDE + ix] = landHeight(
        -EXTENT + ix * STEP,
        -EXTENT + iz * STEP,
      );
    }
  // Constrain whole triangles intersecting ANY deck, including both split branches.
  // Clamping only a nearest centreline or individual vertices misses lower routes.
  const lowerCell = (x, z, ceiling) => {
    const ix = Math.floor((x + EXTENT) / STEP),
      iz = Math.floor((z + EXTENT) / STEP);
    if (ix < 0 || iz < 0 || ix >= CELLS || iz >= CELLS) return;
    for (const index of [
      iz * STRIDE + ix,
      iz * STRIDE + ix + 1,
      (iz + 1) * STRIDE + ix,
      (iz + 1) * STRIDE + ix + 1,
    ]) {
      const vertexX = -EXTENT + (index % STRIDE) * STEP;
      const vertexZ = -EXTENT + Math.floor(index / STRIDE) * STEP;
      heights[index] = Math.min(
        heights[index],
        typeof ceiling === "function" ? ceiling(vertexX, vertexZ) : ceiling,
      );
    }
  };
  if (recipe?.biome === "hydraulic") {
    // Excavate the full authored flume beneath its visible water mesh. Apply
    // the cut through lowerCell so heightAt and the rendered terrain triangles
    // share the same earthworks; the gravity path and water elevation stay put.
    const [start, end] = track.config.sections.spillwayDive;
    const count = Math.ceil(((end - start) * track.length) / 12);
    for (let i = 0; i <= count; i++) {
      const u = start + ((end - start) * i) / count;
      const f = track.frame(u * track.length);
      const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
      for (let offset = f.width + 6; offset <= f.width + 59; offset += 3) {
        const p = f.p.clone().addScaledVector(right, offset);
        lowerCell(p.x, p.z, f.p.y - 3.5);
      }
    }
  }
  for (const f of samples) {
    const bounds = track.bounds(f.u * track.length, f.branch);
    // Grade against the actual sloped/banked deck plane at each CELL CORNER.
    // A single centreline ceiling either clips the lowered edge or leaves the
    // raised edge floating; banking rotates right/up but not the centreline.
    const deckCeiling = (x, z) =>
      f.p.y - (f.up.x * (x - f.p.x) + f.up.z * (z - f.p.z)) / f.up.y - 4.5;
    for (let x = bounds.clipMin - 7; x <= bounds.clipMax + 7; x += 3) {
      lowerCell(f.p.x + f.right.x * x, f.p.z + f.right.z * x, deckCeiling);
    }
  }
  if (!recipe && !desert && !harbor) {
    // Occupied waterfront floors are authored relative to the road. Clear their
    // basements in the land itself; do not push terrain through existing shops.
    const galleries = getWaterfrontDistricts(track);
    for (const [start, end, branch, side] of galleries) {
      // Match the occupied basement slabs emitted by buildFlagship: each bay
      // has one horizontal longitudinal axis, not a continuously climbing floor.
      const bays = Math.ceil(((end - start) * track.length) / 25);
      for (let i = 0; i < bays; i++) {
        const a = track.frame(
          (start + ((end - start) * i) / bays) * track.length,
          branch,
        );
        const b = track.frame(
          (start + ((end - start) * (i + 1)) / bays) * track.length,
          branch,
        );
        const f = track.frame(
          (start + ((end - start) * (i + 0.5)) / bays) * track.length,
          branch,
        );
        const forward = new THREE.Vector2(f.tangent.x, f.tangent.z).normalize();
        const determinant = f.right.x * forward.y - f.right.z * forward.x;
        const ceiling = (px, pz) => {
          const localX =
            ((px - f.p.x) * forward.y - (pz - f.p.z) * forward.x) / determinant;
          return f.p.y + f.right.y * localX - 6.5;
        };
        const half = a.p.distanceTo(b.p) * 0.45 + 3;
        for (let x = f.width + 3; x <= f.width + 39; x += 3)
          for (let z = -half; z <= half + 3; z += 3)
            lowerCell(
              f.p.x + side * f.right.x * x + forward.x * z,
              f.p.z + side * f.right.z * x + forward.y * z,
              ceiling,
            );
      }
    }
    const terminal = track.frame(0.232 * track.length);
    const forward = new THREE.Vector2(
      terminal.tangent.x,
      terminal.tangent.z,
    ).normalize();
    for (let x = terminal.width + 22; x <= terminal.width + 133; x += 5)
      for (let z = -80; z <= 80; z += 5)
        lowerCell(
          terminal.p.x + terminal.right.x * x + forward.x * z,
          terminal.p.z + terminal.right.z * x + forward.y * z,
          terminal.p.y - 10,
        );
  }
  function cellAt(x, z) {
    const gx = (x + EXTENT) / STEP,
      gz = (z + EXTENT) / STEP;
    if (gx < 0 || gz < 0 || gx >= CELLS || gz >= CELLS) return null;
    const ix = Math.floor(gx),
      iz = Math.floor(gz);
    return { ix, iz, u: gx - ix, v: gz - iz };
  }
  function heightAt(x, z) {
    const cell = cellAt(x, z);
    if (!cell) return -25;
    const { ix, iz, u, v } = cell;
    const a = heights[iz * STRIDE + ix],
      b = heights[iz * STRIDE + ix + 1];
    const c = heights[(iz + 1) * STRIDE + ix],
      d = heights[(iz + 1) * STRIDE + ix + 1];
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  function sweepSurface(from, to, clearance = 1.1) {
    // Split the sweep at every crossed grid boundary and triangle diagonal.
    // Height difference is linear inside each exact rendered triangle.
    const delta = to.clone().sub(from);
    const times = [0, 1];
    for (const axis of ["x", "z"]) {
      if (delta[axis] === 0) continue;
      const low = Math.max(
        0,
        Math.ceil((Math.min(from[axis], to[axis]) + EXTENT) / STEP),
      );
      const high = Math.min(
        CELLS,
        Math.floor((Math.max(from[axis], to[axis]) + EXTENT) / STEP),
      );
      for (let n = low; n <= high; n++) {
        const t = (-EXTENT + n * STEP - from[axis]) / delta[axis];
        if (t > 0 && t < 1) times.push(t);
      }
    }
    times.sort((a, b) => a - b);
    const breaks = [...times];
    for (let i = 0; i < times.length - 1; i++) {
      const middle = (times[i] + times[i + 1]) / 2;
      const cell = cellAt(from.x + delta.x * middle, from.z + delta.z * middle);
      if (!cell || delta.x + delta.z === 0) continue;
      const diagonal = -2 * EXTENT + (cell.ix + cell.iz + 1) * STEP;
      const t = (diagonal - from.x - from.z) / (delta.x + delta.z);
      if (t > times[i] && t < times[i + 1]) breaks.push(t);
    }
    breaks.sort((a, b) => a - b);
    for (let i = 0; i < breaks.length - 1; i++) {
      const a = breaks[i],
        b = breaks[i + 1],
        middle = (a + b) / 2;
      const cell = cellAt(from.x + delta.x * middle, from.z + delta.z * middle);
      if (!cell) continue;
      // Get one triangle's plane, also valid at its boundary endpoints.
      const { ix, iz } = cell;
      const h00 = heights[iz * STRIDE + ix],
        h10 = heights[iz * STRIDE + ix + 1];
      const h01 = heights[(iz + 1) * STRIDE + ix],
        h11 = heights[(iz + 1) * STRIDE + ix + 1];
      const lower = cell.u + cell.v <= 1;
      const dx = (lower ? h10 - h00 : h11 - h01) / STEP;
      const dz = (lower ? h01 - h00 : h11 - h10) / STEP;
      const x0 = -EXTENT + ix * STEP,
        z0 = -EXTENT + iz * STEP;
      const plane = (x, z) =>
        lower
          ? h00 + (x - x0) * dx + (z - z0) * dz
          : h11 + (x - x0 - STEP) * dx + (z - z0 - STEP) * dz;
      const distance = (t) =>
        from.y +
        delta.y * t -
        clearance -
        plane(from.x + delta.x * t, from.z + delta.z * t);
      const da = distance(a),
        db = distance(b);
      if (da > 0 && db > 0) continue;
      const fraction = da <= 0 ? a : a + ((b - a) * da) / (da - db);
      const point = from.clone().addScaledVector(delta, fraction);
      point.y = plane(point.x, point.z);
      return {
        fraction,
        point,
        normal: new THREE.Vector3(-dx, 1, -dz).normalize(),
      };
    }
    return null;
  }
  // Spatial chunks cull distant land instead of drawing the entire heightfield.
  const geometries = [];
  const chunkCells = 20;
  for (let row = 0; row < CELLS; row += chunkCells)
    for (let col = 0; col < CELLS; col += chunkCells) {
      const geometry = new THREE.PlaneGeometry(
        chunkCells * STEP,
        chunkCells * STEP,
        chunkCells,
        chunkCells,
      );
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      const colors = [];
      const tint = new THREE.Color();
      for (let iz = 0; iz <= chunkCells; iz++)
        for (let ix = 0; ix <= chunkCells; ix++) {
          const index = iz * (chunkCells + 1) + ix;
          const x = -EXTENT + (col + ix) * STEP,
            z = -EXTENT + (row + iz) * STEP;
          const h = heights[(row + iz) * STRIDE + col + ix];
          positions.setXYZ(index, x, h, z);
          uv.setXY(index, x / 45, z / 45);
          const variation = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.025;
          if (recipe) {
            const [hue, saturation, lightness] = recipe.ground;
            const ice = recipe.biome === "polar";
            const sulfur =
              recipe.biome === "volcanic" &&
              Math.sin(x * 0.013 + z * 0.009) > 0.94;
            tint.setHSL(
              sulfur ? 0.15 : hue,
              sulfur ? 0.48 : saturation,
              lightness + variation + (ice ? Math.max(0, h) * 0.0005 : 0),
            );
          } else if (desert)
            tint.setHSL(0.072, 0.31, 0.43 + h * 0.0006 + variation);
          else if (harbor) tint.setHSL(0.58, 0.12, 0.29 + variation);
          else if (h < 0) tint.setHSL(0.12, 0.15, 0.5 + variation);
          else tint.setHSL(0.25, 0.25, 0.31 + h * 0.0005 + variation);
          colors.push(tint.r, tint.g, tint.b);
        }
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometries.push(geometry);
    }
  function supportClearAt(u, branch = 0) {
    const f = track.frame(u * track.length, branch);
    const foot = heightAt(f.p.x, f.p.z) - 3;
    return samples.every(
      (lower) =>
        lower.p.y >= f.p.y - 12 ||
        lower.p.y <= foot + 1 ||
        Math.hypot(lower.p.x - f.p.x, lower.p.z - f.p.z) >
          lower.width + f.width + 10,
    );
  }
  function bridgeAt(u, branch = 0) {
    if (track.gap(u)) return false;
    if (onUpperBridge(u)) return true;
    const f = track.frame(u * track.length, branch);
    return f.p.y - heightAt(f.p.x, f.p.z) > 14;
  }
  return {
    heightAt,
    sweepSurface,
    geometries,
    samples,
    bridgeAt,
    supportClearAt,
    step: STEP,
    extent: EXTENT,
  };
}
