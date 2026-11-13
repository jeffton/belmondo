import * as THREE from "three";

// Three grounded landmarks: the opening approach, the ballistic caldera and
// the split's southern rim. Nothing crosses the road or changes its physics.
export const CINDER_VOLCANOES = [
  {
    name: "ASH CROWN",
    u: 0.23,
    side: 1,
    setback: 540,
    radius: 330,
    height: 400,
    phase: 0.4,
  },
  {
    name: "CALDERA FURNACE",
    u: 0.62,
    side: 1,
    setback: 560,
    radius: 365,
    height: 420,
    phase: 1.7,
  },
  {
    name: "SULFUR SISTERS",
    u: 0.79,
    side: 1,
    setback: 570,
    radius: 285,
    height: 340,
    phase: 3.1,
  },
];

export function buildCinderVolcanoes(root, track, environment) {
  const stone = [],
    stoneColors = [],
    lava = [],
    lavaColors = [],
    smoke = [],
    smokeColors = [];
  const landmarks = [];
  // Preserve distant silhouettes in an ash-haze palette, beyond the short
  // road fog range, without another lighting or rendering pass.
  const haze = new THREE.Color(track.config.fog);
  const dark = new THREE.Color(0x313039).lerp(haze, 0.3);
  const ash = new THREE.Color(0x77635a).lerp(haze, 0.3);
  const hot = new THREE.Color(0xff6b25).lerp(haze, 0.15);
  const crust = new THREE.Color(0xac3422).lerp(haze, 0.15);
  function triangle(vertices, colors, a, b, c, color) {
    for (const p of [a, b, c]) {
      vertices.push(...p.toArray());
      colors.push(color.r, color.g, color.b);
    }
  }
  for (const v of CINDER_VOLCANOES) {
    const frame = track.frame(v.u * track.length);
    const right = new THREE.Vector3(
      frame.tangent.z,
      0,
      -frame.tangent.x,
    ).normalize();
    const center = frame.p.clone().addScaledVector(right, v.side * v.setback);
    const base = environment.heightAt(center.x, center.z);
    center.y = base;
    const segments = 36;
    // Broad, asymmetric shoulders and a torn OPEN crater, not a pointed cone.
    const profile = [
      [1, 0],
      [0.79, 0.16],
      [0.6, 0.45],
      [0.42, 0.75],
      [0.33, 0.9],
      [0.24, 0.78],
      [0.15, 0.7],
    ];
    const rings = profile.map(([radius, elevation], ring) =>
      Array.from({ length: segments }, (_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        const ridge =
          1 + 0.08 * Math.sin(angle * 5 + v.phase) + 0.04 * Math.cos(angle * 9);
        const x = center.x + Math.cos(angle) * v.radius * radius * ridge;
        const z = center.z + Math.sin(angle) * v.radius * radius * ridge;
        const ground = environment.heightAt(x, z);
        const rim =
          ring >= 3 ? Math.sin(angle * 3 + v.phase) * v.height * 0.035 : 0;
        return new THREE.Vector3(
          x,
          ring === 0 ? ground - 5 : base + v.height * elevation + rim,
          z,
        );
      }),
    );
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const color = dark
          .clone()
          .lerp(
            ash,
            0.16 + (0.5 * ring) / 6 + 0.11 * Math.sin(i * 2.3 + v.phase),
          );
        triangle(
          stone,
          stoneColors,
          rings[ring][i],
          rings[ring + 1][i],
          rings[ring][next],
          color,
        );
        triangle(
          stone,
          stoneColors,
          rings[ring][next],
          rings[ring + 1][i],
          rings[ring + 1][next],
          color,
        );
      }
    }
    const floor = center.clone().add(new THREE.Vector3(0, v.height * 0.68, 0));
    for (let i = 0; i < segments; i++) {
      triangle(
        lava,
        lavaColors,
        floor,
        rings[6][(i + 1) % segments],
        rings[6][i],
        hot,
      );
    }
    // Two restrained lava seams follow actual facets from the broken rim.
    // Opaque, unlit geometry: no lights, transparency passes or particles.
    for (const seam of [4, 19]) {
      for (let ring = 1; ring < 5; ring++) {
        const a = rings[ring][seam].clone();
        const b = rings[ring + 1][seam].clone();
        const c = rings[ring][(seam + 1) % segments].clone().lerp(a, 0.74);
        const d = rings[ring + 1][(seam + 1) % segments].clone().lerp(b, 0.74);
        for (const p of [a, b, c, d]) p.y += 0.6;
        const color = ring < 3 ? crust : hot;
        triangle(lava, lavaColors, a, b, c, color);
        triangle(lava, lavaColors, c, b, d, color);
      }
    }
    // A quiet, wind-shaped fumarole makes the crater readable from low road
    // angles. One opaque faceted mesh, never a particle storm or racing hazard.
    const plume = Array.from({ length: 5 }, (_, ring) =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const radius = [8, 15, 22, 27, 2][ring];
        return new THREE.Vector3(
          center.x + ring * 12 + Math.cos(angle) * radius,
          base + v.height * 0.73 + ring * 33 + Math.sin(angle * 3) * 7,
          center.z + ring * 4 + Math.sin(angle) * radius,
        );
      }),
    );
    for (let ring = 0; ring < 4; ring++) {
      const color = new THREE.Color(0x73646a).lerp(haze, 0.35 + ring * 0.16);
      for (let i = 0; i < 12; i++) {
        const next = (i + 1) % 12;
        triangle(
          smoke,
          smokeColors,
          plume[ring][i],
          plume[ring + 1][i],
          plume[ring][next],
          color,
        );
        triangle(
          smoke,
          smokeColors,
          plume[ring][next],
          plume[ring + 1][i],
          plume[ring + 1][next],
          color,
        );
      }
    }
    landmarks.push({ ...v, center, rings });
  }
  function mesh(name, positions, colors, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    root.add(result);
  }
  mesh(
    "cinder-volcano-rock",
    stone,
    stoneColors,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      fog: false,
    }),
  );
  mesh(
    "cinder-volcano-lava",
    lava,
    lavaColors,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  mesh(
    "cinder-volcano-fumaroles",
    smoke,
    smokeColors,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      fog: false,
    }),
  );
  root.userData.volcanoes = landmarks;
}
