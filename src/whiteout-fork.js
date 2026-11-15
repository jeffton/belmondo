import * as THREE from "three";

/** One exposed snow bridge above a separate, roofed blue-ice cutting. */
export function buildWhiteoutFork(parent, track, environment) {
  const root = new THREE.Group();
  root.name = "whiteout-snowbridge-icecut";
  parent.add(root);
  const batches = new Map();
  const colors = new Map();
  const palette = {
    "snowbridge-steel": 0x416378,
    "snowbridge-snow": 0xe0f4f4,
    "icecut-gallery": 0x63abc1,
  };
  const point = (f, x, y) =>
    f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, y);
  function triangle(kind, a, b, c, tint = palette[kind]) {
    if (!batches.has(kind)) {
      batches.set(kind, []);
      colors.set(kind, []);
    }
    const color = new THREE.Color(tint);
    for (const p of [a, b, c]) {
      batches.get(kind).push(...p.toArray());
      colors.get(kind).push(color.r, color.g, color.b);
    }
  }
  function quad(kind, a, b, c, d, tint) {
    triangle(kind, a, b, c, tint);
    triangle(kind, a, c, d, tint);
  }
  function prism(kind, a, b, leftA, rightA, leftB, rightB, low, high) {
    const vertices = [
      point(a, leftA, low),
      point(a, rightA, low),
      point(b, rightB, low),
      point(b, leftB, low),
      point(a, leftA, high),
      point(a, rightA, high),
      point(b, rightB, high),
      point(b, leftB, high),
    ];
    box(kind, vertices);
  }
  function box(kind, p) {
    for (const [a, b, c, d] of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ])
      quad(kind, p[a], p[b], p[c], p[d]);
  }
  function beam(kind, a, b, radius) {
    const direction = b.clone().sub(a).normalize();
    const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const corner = (p, x, y) =>
      p
        .clone()
        .addScaledVector(right, x * radius)
        .addScaledVector(up, y * radius);
    box(kind, [
      corner(a, -1, -1),
      corner(a, 1, -1),
      corner(b, 1, -1),
      corner(b, -1, -1),
      corner(a, -1, 1),
      corner(a, 1, 1),
      corner(b, 1, 1),
      corner(b, -1, 1),
    ]);
  }
  function frames(start, end, branch, step) {
    const count = Math.ceil(((end - start) * track.length) / step);
    return Array.from({ length: count + 1 }, (_, i) =>
      track.frame((start + ((end - start) * i) / count) * track.length, branch),
    );
  }
  // The full span is carried by edge trusses, not columns through the cutting.
  // Everything on the upper deck is below its racing plane; the sky stays open.
  const bridge = frames(0.795, 0.815, -1, 15);
  for (let i = 0; i < bridge.length - 1; i++) {
    const a = bridge[i],
      b = bridge[i + 1];
    prism(
      "snowbridge-steel",
      a,
      b,
      -a.width,
      a.width,
      -b.width,
      b.width,
      -6,
      -4,
    );
    for (const side of [-1, 1]) {
      const edgeA = side * (a.width + 2),
        edgeB = side * (b.width + 2);
      for (const y of [-5, -12])
        beam("snowbridge-steel", point(a, edgeA, y), point(b, edgeB, y), 0.8);
      beam("snowbridge-steel", point(a, edgeA, -12), point(b, edgeB, -5), 0.6);
      beam("snowbridge-steel", point(a, edgeA, -5), point(b, edgeB, -12), 0.6);
      prism(
        "snowbridge-snow",
        a,
        b,
        side < 0 ? -a.width - 4 : a.width + 0.5,
        side < 0 ? -a.width - 0.5 : a.width + 4,
        side < 0 ? -b.width - 4 : b.width + 0.5,
        side < 0 ? -b.width - 0.5 : b.width + 4,
        -4,
        -2.5,
      );
    }
  }
  const foundations = [];
  const gallery = frames(0.792, 0.822, 1, 12);
  for (let i = 0; i < gallery.length - 1; i++) {
    const a = gallery[i],
      b = gallery[i + 1];
    // Keep the exact clear soffit; only the exterior becomes a fractured,
    // snow-capped glacial shelf rather than a flat concrete lintel.
    const roofProfile = (f, station) => {
      const drift = [0, 0.7, -0.3, 1.1, 0.2, -0.6][station % 6];
      return [
        point(f, -f.width - 16, 30),
        point(f, f.width + 16, 30),
        point(f, f.width + 16, 32),
        point(f, f.width * 0.3, 35.5 + drift),
        point(f, -f.width * 0.45, 36.5 + drift),
        point(f, -f.width - 16, 32),
      ];
    };
    const roofA = roofProfile(a, i),
      roofB = roofProfile(b, i + 1);
    const snow = [0xe0f4f4, 0xcbe5ed, 0xd7eef2];
    for (let edge = 0; edge < roofA.length; edge++) {
      const next = (edge + 1) % roofA.length;
      const tint = edge >= 2 && edge <= 4 ? snow[(edge + i) % 3] : 0x83c2d3;
      quad(
        "icecut-gallery",
        roofA[edge],
        roofB[edge],
        roofB[next],
        roofA[next],
        tint,
      );
    }
    for (const profile of [roofA, roofB])
      for (let j = 1; j < profile.length - 1; j++)
        triangle(
          "icecut-gallery",
          profile[0],
          profile[j],
          profile[j + 1],
          j % 2 ? 0x63abc1 : 0x8bc8d8,
        );
    for (const side of [-1, 1]) {
      const coordinates = [
        [a, side * (a.width + 10.5)],
        [a, side * (a.width + 15.5)],
        [b, side * (b.width + 15.5)],
        [b, side * (b.width + 10.5)],
      ];
      const top = coordinates.map(([f, x]) => point(f, x, 31));
      const bottom = top.map((p) =>
        p.clone().setY(environment.heightAt(p.x, p.z) - 1),
      );
      // The inner wall stays put. An outboard ice arris breaks the outer
      // silhouette into broad, irregular planes; it never enters road space.
      const arris = (f, station) =>
        point(
          f,
          side * (f.width + 18 + [0, 1.8, -0.5, 0.8][station % 4]),
          16 + [0, 3, -1, 2][station % 4],
        );
      const outerA = arris(a, i),
        outerB = arris(b, i + 1);
      quad("icecut-gallery", bottom[0], bottom[3], top[3], top[0], 0x63abc1);
      quad(
        "icecut-gallery",
        bottom[1],
        bottom[2],
        outerB,
        outerA,
        i % 2 ? 0x559bb8 : 0x63abc1,
      );
      quad(
        "icecut-gallery",
        outerA,
        outerB,
        top[2],
        top[1],
        i % 3 ? 0x8bc8d8 : 0x71b4cc,
      );
      quad("icecut-gallery", top[0], top[1], top[2], top[3], 0xcbe5ed);
      quad("icecut-gallery", bottom[0], bottom[1], bottom[2], bottom[3]);
      for (const profile of [
        [bottom[0], bottom[1], outerA, top[1], top[0]],
        [bottom[3], bottom[2], outerB, top[2], top[3]],
      ])
        for (let j = 1; j < profile.length - 1; j++)
          triangle(
            "icecut-gallery",
            profile[0],
            profile[j],
            profile[j + 1],
            j % 2 ? 0x71b4cc : 0x8bc8d8,
          );
      foundations.push(bottom.map((p) => p.clone()));
    }
  }
  for (const [kind, positions] of batches) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    if (kind === "icecut-gallery")
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors.get(kind), 3),
      );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color: kind === "icecut-gallery" ? 0xffffff : palette[kind],
        vertexColors: kind === "icecut-gallery",
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    mesh.name = `whiteout-${kind}`;
    root.add(mesh);
  }
  root.userData.foundations = foundations;
  return root;
}
