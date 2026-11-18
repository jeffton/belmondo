import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { EnvironmentSurface } from "./environment.ts";
import type { Track } from "./track.ts";

type Point = [number, number, number];
const cream = 0xf7e5bf;
const sand = 0xc2ab88;
const coral = 0xe6765c;
const coralShadow = 0xb04c41;
const teal = 0x3e8589;
const ink = 0x24434b;
const apron = 0x747c78;
const lamps = 0xffd597;
const seaLevel = -16;
const up = new THREE.Vector3(0, 1, 0);

/** Visual-only harbour airport for the Coast layout. Call after the waterfront. */
export function buildPalmBreakerAirport(
  parent: THREE.Object3D,
  track: Track,
  environment: Pick<EnvironmentSurface, "heightAt">,
): THREE.Group {
  const frame = track.frame(0.846 * track.length);
  const right = new THREE.Vector3(
    frame.tangent.z,
    0,
    -frame.tangent.x,
  ).normalize();
  const root = new THREE.Group();
  root.name = "palm-breaker-airport";
  // Seaward of the shipyard ribs. The roof reaches pilot height, while the
  // broad plinth and floating berths read independently down at the water.
  root.position.copy(frame.p).addScaledVector(right, frame.width + 139);
  root.position.y = frame.p.y - 70;
  root.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
  root.updateMatrix();

  const opaque: THREE.BufferGeometry[] = [];
  const luminous: THREE.BufferGeometry[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const tint = new THREE.Color();
  const seabedAt = (x: number, z: number) => {
    const p = new THREE.Vector3(x, 0, z).applyMatrix4(root.matrix);
    return environment.heightAt(p.x, p.z) - root.position.y;
  };
  function add(g: THREE.BufferGeometry, color: number, lit = false) {
    g.deleteAttribute("uv");
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    tint.setHex(color);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    (lit ? luminous : opaque).push(g);
  }
  function box(p: Point, size: Point, color: number, lit = false, yaw = 0) {
    add(
      cube
        .clone()
        .scale(...size)
        .rotateY(yaw)
        .translate(...p),
      color,
      lit,
    );
  }
  function spar(
    a: Point,
    b: Point,
    width: number,
    color: number,
    depth = width,
  ) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const delta = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(
      up,
      delta.clone().normalize(),
    );
    add(
      cube
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().compose(
            va.lerp(vb, 0.5),
            q,
            new THREE.Vector3(width, delta.length(), depth),
          ),
        ),
      color,
    );
  }
  function face(a: Point, b: Point, c: Point, d: Point, color: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    add(g, color);
  }
  function drum(
    x: number,
    z: number,
    low: number,
    high: number,
    base: number,
    cap: number,
    color: number,
  ) {
    add(
      new THREE.CylinderGeometry(cap, base, high - low, 10)
        .rotateY(Math.PI / 10)
        .translate(x, (low + high) / 2, z),
      color,
    );
  }
  function pile(x: number, z: number, top: number, width: number) {
    const foot = seabedAt(x, z) - 2;
    if (foot >= top) return;
    box([x, (foot + top) / 2, z], [width, top - foot, width * 1.25], sand);
    box([x, top - 1.8, z], [width + 2.4, 3.6, width * 1.25 + 2.4], ink);
  }

  // Straight pile-supported apron, with a cream edge over a coral shadow line.
  box([0, -3.1, 0], [116, 5.8, 346], coralShadow);
  box([0, -0.95, 0], [117, 1.9, 347], cream);
  box([0, 0.08, 0], [111, 0.16, 341], apron);
  for (let z = -160; z <= 160; z += 32) {
    for (const x of [-48, 0, 48]) pile(x, z, -5.7, x === 0 ? 5 : 6.5);
    box([-58.6, -0.5, z], [1.4, 0.65, 9], lamps, true);
    box([-44, 0.21, z], [0.65, 0.1, 10], cream);
  }
  for (const z of [-135, 130]) {
    for (const x of [-41, -36, -31, -26])
      box([x, 0.21, z], [1.8, 0.1, 16], cream);
    box([-10, 0.36, z + 10], [42, 0.65, 2.4], coral);
  }
  for (const [x, z] of [
    [-51, -156],
    [-51, -87],
    [-51, 1],
    [-51, 85],
    [-51, 155],
  ]) {
    box([x, 5.1, z], [1.35, 10.2, 1.35], teal);
    box([x + 2.6, 10.1, z], [6.9, 1.2, 3.2], ink);
    box([x + 2.6, 9.46, z], [5.4, 0.15, 2.4], lamps, true);
  }

  // Folded gullwing roof in low segment count: the main hall rises high over
  // tinted glass, dips onto a coral saddle, then sweeps up toward the bay.
  // Each rib defines z, height on the close/middle/far roof lines, and sweep.
  const ribs = [
    [-105, 18, 25, 28, 12],
    [-89, 31, 39, 44, 5],
    [-68, 44, 52, 49, -3],
    [-44, 52, 60, 53, -8],
    [-18, 55, 62, 54, -12],
    [8, 53, 58, 50, -10],
    [33, 46, 52, 47, -5],
    [54, 36, 43, 42, 1],
    [76, 28, 36, 36, 7],
    [96, 33, 42, 42, 10],
    [117, 43, 49, 47, 15],
    [137, 47, 51, 46, 18],
  ];
  const roof = ribs.map(([z, near, middle, far, sweep]): Point[] => [
    [-31, near, z - sweep * 0.22],
    [8, middle, z + sweep * 0.32],
    [47, far, z + sweep],
  ]);
  const down = ([x, y, z]: Point, depth: number): Point => [x, y - depth, z];
  const shell = roof.map(([near, ridge, far]): Point[] => {
    const inset = (a: Point, b: Point, x: number): Point => {
      const t = (x - a[0]) / (b[0] - a[0]);
      return [
        x,
        THREE.MathUtils.lerp(a[1], b[1], t) - 3,
        THREE.MathUtils.lerp(a[2], b[2], t),
      ];
    };
    return [inset(near, ridge, -24), inset(ridge, far, 41)];
  });
  function glazing(a: Point, b: Point, n: number) {
    const mix = (s: number, height: number): Point => [
      THREE.MathUtils.lerp(a[0], b[0], s),
      height,
      THREE.MathUtils.lerp(a[2], b[2], s),
    ];
    const y = (s: number) => THREE.MathUtils.lerp(a[1], b[1], s);
    const glass = [0x205263, 0x286674, 0x357584, 0x245c70];
    face(mix(0, 0.12), mix(0, 4.9), mix(1, 4.9), mix(1, 0.12), sand);
    face(mix(0, 4.9), mix(0, 7), mix(1, 7), mix(1, 4.9), coral);
    for (let i = 0; i < n; i++) {
      const l = i / n;
      const r = (i + 1) / n;
      const lo = 7;
      const shade = (i + Math.floor(Math.abs(a[2]) / 12)) % glass.length;
      face(mix(l, lo), mix(l, y(l)), mix(r, y(r)), mix(r, lo), glass[shade]);
      // Opaque low-res reflections: no transparent overdraw or environment map.
      // Mullions in front of the grid do the detail work at race speed.
      spar(mix(l, 5.3), mix(l, y(l)), 0.72, cream);
    }
    spar(mix(0, 7), mix(1, 7), 1.2, cream);
    for (const h of [0.39, 0.72])
      spar(
        mix(0, THREE.MathUtils.lerp(7, y(0), h)),
        mix(1, THREE.MathUtils.lerp(7, y(1), h)),
        h < 0.5 ? 0.55 : 0.85,
        h < 0.5 ? sand : teal,
      );
  }
  for (let i = 0; i < roof.length - 1; i++) {
    const a = roof[i];
    const b = roof[i + 1];
    for (let j = 0; j < 2; j++) {
      face(a[j], b[j], b[j + 1], a[j + 1], j === 0 ? cream : 0xe2ceaa);
      face(
        down(a[j], 3),
        down(a[j + 1], 3),
        down(b[j + 1], 3),
        down(b[j], 3),
        sand,
      );
    }
    for (const j of [0, 2]) {
      face(down(a[j], 3), down(b[j], 3), down(b[j], 1), down(a[j], 1), coral);
      face(down(a[j], 1), down(b[j], 1), b[j], a[j], cream);
    }
    for (const j of [0, 1]) glazing(shell[i][j], shell[i + 1][j], 3);
    if (i % 2 === 0) {
      const [x, y, z] = a[0];
      spar([-19, 5, z + 7], [x + 1.8, y - 3, z], 2.7, cream);
      spar([-19, 5, z + 7], [x + 1.8, y - 3, z + 13], 2, sand);
    }
  }
  for (const i of [0, roof.length - 1]) {
    const rib = roof[i];
    for (let j = 0; j < 2; j++) {
      face(down(rib[j], 3), rib[j], rib[j + 1], down(rib[j + 1], 3), coral);
    }
    // The centre cap meets the raised roof ridge instead of leaving an open gable.
    const [a, b] = shell[i];
    const middle = down(rib[1], 3);
    glazing(a, middle, 4);
    glazing(middle, b, 4);
  }

  // ATC beyond the near apron: tapering shaft, flared cab and radios.
  const tx = 9;
  const tz = -134;
  drum(tx, tz, 0, 6, 13, 13, sand);
  drum(tx, tz, 6, 44, 10, 7, cream);
  drum(tx, tz, 44, 62, 7, 15, cream);
  drum(tx, tz, 62, 65, 15, 18, coral);
  drum(tx, tz, 65, 77, 16, 19, ink);
  drum(tx, tz, 77, 80, 19.5, 18, cream);
  drum(tx, tz, 80, 82, 17, 16, coral);
  drum(tx, tz, 82, 88, 9, 7, cream);
  for (let i = 0; i < 10; i++) {
    const s = ((i + 0.5) * Math.PI) / 5;
    const point = (r: number, y: number): Point => [
      tx + Math.sin(s) * r,
      y,
      tz + Math.cos(s) * r,
    ];
    spar(point(16, 65), point(19, 77), 0.7, sand);
  }
  for (const x of [-4, 3]) {
    box([tx + x, 91, tz], [0.7, 8, 0.7], ink);
    box([tx + x, 95, tz], [1.12, 0.8, 1.12], 0xff8664, true);
  }
  box([tx - 0.5, 92, tz], [11, 0.48, 0.65], ink);
  box([tx - 8.7, 30, tz], [1, 42, 2.4], coral);
  box([tx - 9.2, 29, tz + 3.3], [0.8, 34, 1.55], teal);

  // Moor on the approach side so neither plane is hidden behind the terminal.
  const water = seaLevel - root.position.y;
  const dock = -12;
  box([dock, water + 1.6, -210], [14, 2, 74], ink);
  box([dock, water + 2.65, -210], [14.5, 0.4, 74], cream);
  for (const z of [-239, -225, -209, -194, -180]) {
    pile(dock, z, water + 3, 2.2);
    box([dock - 5.5, water + 3.3, z], [2, 1.1, 1.5], coral);
  }
  const plane = -32;
  for (const z of [-224, -195]) {
    for (const x of [plane - 5.5, plane + 5.5]) {
      box([x, water + 0.55, z], [2.2, 1.2, 15], cream);
      spar([x, water + 0.9, z - 3], [plane, water + 3.5, z - 2], 0.6, ink);
      spar([x, water + 0.9, z + 3], [plane, water + 3.5, z + 2], 0.6, ink);
    }
    box([plane, water + 4, z], [3.1, 2.8, 18], cream);
    box([plane, water + 5.2, z + 2], [2.7, 1.2, 5.8], ink);
    box([plane, water + 5.9, z - 1], [22, 0.62, 5], cream);
    box([plane, water + 4.9, z - 7], [8, 0.5, 3.4], coral);
    spar(
      [plane, water + 4.5, z - 7.9],
      [plane, water + 8.6, z - 9.8],
      0.74,
      coral,
      3.8,
    );
    box([plane, water + 4.45, z + 9.2], [4.2, 0.4, 0.6], ink);
  }

  const finish = (
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
    name: string,
  ) => {
    const geometry = mergeGeometries(parts)!;
    geometry.computeBoundingSphere();
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    root.add(mesh);
  };
  finish(
    opaque,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    "terminal-apron-and-aircraft",
  );
  finish(
    luminous,
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    "airport-lamps",
  );
  cube.dispose();
  parent.add(root);
  return root;
}
