import * as THREE from "three";

const SEA_LEVEL = -16;
const EXTENT = 1600;
const CELLS = 64;
const STEP = (EXTENT * 2) / CELLS;

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Static scenery only; all local infrastructure stays beneath the racing deck. */
export function buildEnvironment(scene, track, textures) {
  const desert = track.config.name === "SOLAR ARRAY";
  const harbor = track.config.name === "NOCTILUCENT";
  const group = new THREE.Group();
  group.name = "environment";
  scene.add(group);

  const material = (color, map) =>
    new THREE.MeshLambertMaterial({ color, map, flatShading: true });
  const concrete = material(harbor ? 0x707f89 : 0xaaa997, textures.concrete);
  const asphalt = material(desert ? 0x756858 : 0x56656a, textures.road);
  const metal = material(harbor ? 0x44586a : 0x73868a, textures.facade);
  const paint = material(track.config.color, textures.paint);
  const batches = new Map();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Object3D();

  function box(mat, x, y, z, w, h, d, rotation = 0) {
    if (!batches.has(mat)) batches.set(mat, []);
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    batches.get(mat).push(transform.matrix.clone());
  }

  function terrainHeight(x, z) {
    const distance = Math.hypot(x * 0.92, z);
    const outer = smooth(740, 1330, distance);
    if (desert) {
      const dunes =
        Math.sin(x * 0.011 + Math.sin(z * 0.004)) * 5 +
        Math.cos(z * 0.014 + x * 0.002) * 3;
      const escarpment =
        smooth(780, 1060, -z) * 110 + smooth(960, 1320, x) * 75;
      return 8 + dunes + escarpment + outer * (20 + 20 * Math.sin(x * 0.006));
    }
    if (harbor) {
      // The two waterways meet in an open freight basin to the west.
      const channel =
        Math.abs(x) < 75 ||
        (z > 125 && z < 225) ||
        (x < -550 && z > -350 && z < 450);
      if (channel) return -24;
      if (distance < 1050) return 3;
      return 3 + outer * (35 + 24 * Math.sin(x * 0.004) * Math.cos(z * 0.004));
    }
    const shore =
      -180 +
      90 * Math.sin(z * 0.0035) -
      170 * Math.exp(-(((z + 160) / 260) ** 2));
    const inland = smooth(shore - 65, shore + 110, x);
    const headland = smooth(650, 1150, x) * (90 + 55 * Math.cos(z * 0.004));
    return -25 + inland * (36 + 3 * Math.sin(z * 0.013)) + headland;
  }

  // A continuous heightfield gives the low view, raised track and skyline a shared ground.
  const geometry = new THREE.PlaneGeometry(
    EXTENT * 2,
    EXTENT * 2,
    CELLS,
    CELLS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = terrainHeight(x, z);
    positions.setY(i, h);
    const variation = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.025;
    if (desert) tint.setHSL(0.095, 0.24, 0.48 + h * 0.0006 + variation);
    else if (harbor) tint.setHSL(0.58, 0.12, 0.25 + variation);
    else if (h < -3) tint.setHSL(0.12, 0.15, 0.53 + variation);
    else tint.setHSL(0.19, 0.13, 0.39 + h * 0.0007 + variation);
    colors.push(tint.r, tint.g, tint.b);
  }
  // Ground UVs use physical metres, not a stretched texture over the whole island.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, positions.getX(i) / 45, positions.getZ(i) / 45);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: textures.concrete,
        flatShading: true,
      }),
    ),
  );

  // Interpolate the actual mesh triangles, so tower bases and support feet touch it.
  function heightAt(x, z) {
    const gx = THREE.MathUtils.clamp((x + EXTENT) / STEP, 0, CELLS - 0.000001);
    const gz = THREE.MathUtils.clamp((z + EXTENT) / STEP, 0, CELLS - 0.000001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    const a = positions.getY(iz * (CELLS + 1) + ix);
    const b = positions.getY(iz * (CELLS + 1) + ix + 1);
    const c = positions.getY((iz + 1) * (CELLS + 1) + ix);
    const d = positions.getY((iz + 1) * (CELLS + 1) + ix + 1);
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  // Ground-level access roads include embankments, rather than floating ribbons.
  function serviceRoad(x1, z1, x2, z2, width = 12) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const segments = Math.ceil(length / 24);
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i < segments; i++) {
      const t = (i + 0.5) / segments;
      const x = THREE.MathUtils.lerp(x1, x2, t);
      const z = THREE.MathUtils.lerp(z1, z2, t);
      const y = heightAt(x, z);
      if (y < SEA_LEVEL + 5) continue;
      box(concrete, x, y + 0.6, z, width + 4, 1.2, length / segments + 1, yaw);
      box(asphalt, x, y + 1.3, z, width, 0.25, length / segments + 1, yaw);
      box(paint, x, y + 1.45, z, 0.3, 0.06, 8, yaw);
    }
  }

  if (harbor) {
    // Reclaimed quays, pile-supported wharves and long cargo sheds establish scale.
    for (const x of [-425, -225, 225, 425, 675]) {
      for (const z of [-425, -150, 350, 575]) {
        box(concrete, x, -6, z, 140, 20, 180);
        box(asphalt, x, 4.2, z, 126, 0.4, 164);
        for (let j = 0; j < 4; j++) {
          box(paint, x - 45 + j * 30, 4.5, z + 65, 12, 0.15, 2);
          box(metal, x - 45 + j * 30, 9, z - 48, 22, 9, 38);
        }
      }
    }
    for (const x of [-100, 100]) {
      box(concrete, x, -7, -175, 12, 23, 600);
      box(concrete, x, -7, 575, 12, 23, 650);
    }
    for (const z of [100, 250]) box(concrete, 0, -7, z, 1100, 23, 12);
    for (const x of [-350, 350, 650]) serviceRoad(x, -650, x, 700, 16);
    for (const z of [-550, 400, 650]) serviceRoad(-700, z, 800, z, 16);
    // Short bridge decks connect the quays across the central canal.
    for (const z of [-550, 400, 650]) {
      box(concrete, 0, 6, z, 220, 4, 22);
      box(asphalt, 0, 8.1, z, 220, 0.2, 16);
    }
  } else if (desert) {
    serviceRoad(-750, 250, 850, 250, 14);
    serviceRoad(600, -700, 600, 850, 14);
    // Ordered solar farms on the basin floor, with a substation and feeder road.
    const panels = material(0x263e52, textures.facade);
    for (let row = 0; row < 14; row++) {
      for (let col = 0; col < 12; col++) {
        const x = 450 + col * 26;
        const z = -480 + row * 29;
        const y = heightAt(x, z);
        box(concrete, x, y + 1, z, 3, 2, 3);
        box(panels, x, y + 2.4, z, 20, 0.7, 16, -0.15);
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = -650 + i * 220;
      const z = 700;
      const y = heightAt(x, z);
      box(concrete, x, y + 6, z, 6, 12, 6);
      box(metal, x, y + 12, z, 24, 2, 7);
    }
    box(concrete, 680, heightAt(680, 180) + 4, 180, 100, 8, 85);
  } else {
    serviceRoad(250, -750, 250, 800, 16);
    serviceRoad(250, 350, 1000, 350, 16);
    serviceRoad(250, -350, 1000, -350, 16);
    // An inhabited waterfront: stepped sea defenses, breakwater and pier fingers.
    for (let i = 0; i < 24; i++) {
      const z = -700 + i * 60;
      let x = -600;
      while (heightAt(x, z) < 0) x += 10;
      const y = heightAt(x, z);
      box(concrete, x, y - 4, z, 18, 10, 63);
      box(concrete, x + 14, y + 0.4, z, 18, 1, 63);
      if (i % 4 === 0) {
        box(concrete, x - 48, -3, z, 95, 3, 18);
        for (const offset of [-80, -40]) {
          box(concrete, x + offset, -10, z, 5, 16, 12);
        }
      }
    }
    box(concrete, -650, -11, 120, 22, 14, 570);
    box(concrete, -555, -11, 395, 210, 14, 22);
  }

  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(boxGeometry, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  const roadSamples = [];
  for (let i = 0; i < 240; i++) {
    for (const branch of [-1, 0, 1]) {
      roadSamples.push(track.frame((i / 240) * track.length, branch).p);
    }
  }
  const clearOfRoad = (x, z) =>
    roadSamples.every((p) => Math.hypot(x - p.x, z - p.z) > 76);

  /** Returns a NEW Vector3 at the foundation ground height; does not modify p. */
  function buildingPosition(p) {
    // Radial relocation keeps shoreline towers on land without creating water islands.
    const searchExtent = Math.hypot(Math.abs(p.x) + 1300, Math.abs(p.z) + 1300);
    for (let radius = 0; radius <= searchExtent + 50; radius += 50) {
      const steps = radius === 0 ? 1 : Math.ceil((radius * Math.PI * 2) / 50);
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const x = p.x + Math.cos(angle) * radius;
        const z = p.z + Math.sin(angle) * radius;
        if (Math.abs(x) > 1300 || Math.abs(z) > 1300) continue;
        const y = heightAt(x, z);
        // Check the full 60m footprint against the shore, not merely its centre.
        if (y < 1 || !clearOfRoad(x, z)) continue;
        const corners = [-30, 30].flatMap((dx) =>
          [-30, 30].map((dz) => heightAt(x + dx, z + dz)),
        );
        if (
          Math.min(...corners) < 0 ||
          Math.max(...corners) - Math.min(...corners) > 12
        )
          continue;
        return new THREE.Vector3(x, Math.max(y, ...corners), z);
      }
    }
    throw new Error("No land footprint available for building placement");
  }

  return { heightAt, buildingPosition, group };
}
