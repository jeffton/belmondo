import * as THREE from "three";

/** Walk real deck metres, including ramp slope, without crossing the missing deck. */
export function offsetAlongDeck(track, station, metres) {
  let remaining = Math.abs(metres);
  const direction = Math.sign(metres);
  while (remaining > 0) {
    const next = station + direction * 2;
    const distance = track.frame(station).p.distanceTo(track.frame(next).p);
    if (distance >= remaining)
      return station + (direction * 2 * remaining) / distance;
    station = next;
    remaining -= distance;
  }
  return station;
}

export function getJumpMarkingLayout(track) {
  const launch = track.config.jump * track.length - 0.000001;
  const landing = (track.config.jump + track.config.gapLength) * track.length;
  const patches = [];
  function patch(kind, anchor, distance, left, right, length, color) {
    const station = offsetAlongDeck(track, anchor, distance);
    patches.push({
      kind,
      distance,
      anchor,
      station,
      left,
      right,
      color,
      start: offsetAlongDeck(track, station, -length / 2),
      end: offsetAlongDeck(track, station, length / 2),
    });
  }
  // Contracting, broken transverse slab marks leave the central racing line open.
  for (const distance of [-96, -60, -32, -12]) {
    for (const [left, right] of [
      [-0.91, -0.65],
      [-0.58, -0.28],
      [0.28, 0.58],
      [0.65, 0.91],
    ])
      patch("approach", launch, distance, left, right, 1.4, 0xe4d9c2);
  }
  // Sparse open brackets identify the receiving deck, not a boost/pickup socket.
  for (const distance of [20, 96, 208]) {
    for (const side of [-1, 1]) {
      const a = side * 0.34,
        b = side * 0.91;
      patch(
        "landing",
        landing,
        distance,
        Math.min(a, b),
        Math.max(a, b),
        1.6,
        0xe4d9c2,
      );
      const c = side * 0.86;
      patch(
        "landing",
        landing,
        distance + 2.5,
        Math.min(c, b),
        Math.max(c, b),
        6.6,
        0xc17b67,
      );
    }
  }
  return patches;
}

function paintTexture() {
  const pixels = new Uint8Array(64 * 32 * 4);
  let seed = 7901;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const grain = 225 + (seed % 30);
    pixels.set([grain, grain, grain, seed % 101 < 14 ? 0 : 255], i);
  }
  const texture = new THREE.DataTexture(pixels, 64, 32);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Printed directly onto the deck; no collider, raised pad, arrow or light. */
export function buildJumpMarkings(scene, track, lighting) {
  const positions = [],
    colors = [],
    uv = [];
  const layout = getJumpMarkingLayout(track);
  for (const patch of layout) {
    const a = track.frame(patch.start),
      b = track.frame(patch.end);
    const points = [
      a.p.clone().addScaledVector(a.right, patch.left * a.width),
      a.p.clone().addScaledVector(a.right, patch.right * a.width),
      b.p.clone().addScaledVector(b.right, patch.right * b.width),
      b.p.clone().addScaledVector(b.right, patch.left * b.width),
    ];
    for (const index of [0, 2, 1, 0, 3, 2]) {
      const p = points[index],
        tint = new THREE.Color(lighting.shade(p, patch.color));
      positions.push(...p.toArray());
      colors.push(tint.r, tint.g, tint.b);
      uv.push(
        (index === 0 || index === 3 ? patch.left : patch.right) * a.width,
        index < 2 ? patch.start : patch.end,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: paintTexture(),
    alphaTest: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "jump-road-markings";
  scene.add(mesh);
  return { mesh, layout };
}
