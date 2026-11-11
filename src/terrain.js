import * as THREE from "three";

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const EXTENT = 2300;
const CELLS = 200;
const STEP = (EXTENT * 2) / CELLS;
const STRIDE = CELLS + 1;

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
  const crossings = (harbor ? [0.135, 0.5] : desert ? [] : [0.215]).map((u) => {
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
  const jump = track.frame((track.config.jump + 0.007) * track.length);
  const jumpForward = new THREE.Vector2(
    jump.tangent.x,
    jump.tangent.z,
  ).normalize();
  function ravine(x, z) {
    const along = Math.abs(
      (x - jump.p.x) * jumpForward.x + (z - jump.p.z) * jumpForward.y,
    );
    const across = Math.abs(
      (x - jump.p.x) * jumpForward.y - (z - jump.p.z) * jumpForward.x,
    );
    return (1 - smooth(42, 100, along)) * (1 - smooth(100, 230, across));
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
    const r = Math.hypot((x + (desert ? 740 : 650)) / 1050, z / 1100);
    let base;
    if (desert) {
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
    const grade = 1 - smooth(desert ? 75 : 65, desert ? 240 : 190, distance);
    const fill =
      f.p.y - (f.up.x * (x - f.p.x) + f.up.z * (z - f.p.z)) / f.up.y - 4.5;
    let y = THREE.MathUtils.lerp(base, fill, grade);
    // Higher ground outside the shoulder forms real cuttings, not floating rock walls.
    if (distance > f.width + 38) y = Math.max(y, base);
    const cut = Math.max(waterway(x, z), ravine(x, z));
    y = THREE.MathUtils.lerp(y, desert ? 15 : -25, cut);
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
  if (!desert && !harbor) {
    // Occupied waterfront floors are authored relative to the road. Clear their
    // basements in the land itself; do not push terrain through existing shops.
    const galleries = [
      [0.008, 0.102, 0, 1],
      [0.023, 0.088, 0, -1],
      [0.306, 0.365, -1, -1],
      [0.355, 0.411, 1, 1],
      [0.555, 0.604, 0, -1],
      [0.704, 0.745, 0, 1],
      [0.925, 0.983, 0, -1],
    ];
    for (const [start, end, branch, side] of galleries) {
      const bays = Math.ceil(((end - start) * track.length) / 5);
      for (let i = 0; i <= bays; i++) {
        const f = track.frame(
          (start + ((end - start) * i) / bays) * track.length,
          branch,
        );
        for (let x = f.width + 3; x <= f.width + 39; x += 4) {
          lowerCell(
            f.p.x + side * f.right.x * x,
            f.p.z + side * f.right.z * x,
            (px, pz) =>
              f.p.y -
              (f.up.x * (px - f.p.x) + f.up.z * (pz - f.p.z)) / f.up.y -
              6.5,
          );
        }
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
          if (desert) tint.setHSL(0.072, 0.31, 0.43 + h * 0.0006 + variation);
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
  function bridgeAt(u, branch = 0) {
    if (track.gap(u)) return false;
    const f = track.frame(u * track.length, branch);
    return f.p.y - heightAt(f.p.x, f.p.z) > 14;
  }
  return {
    heightAt,
    sweepSurface,
    geometries,
    samples,
    bridgeAt,
    step: STEP,
    extent: EXTENT,
  };
}
