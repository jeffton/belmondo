import * as THREE from "three";

/** Visible water beside the racing plunge, not an invisible reservoir above it. */
export function buildDamRaceway(parent, track, textures, environment) {
  const root = new THREE.Group();
  root.name = "monsoon-dam-raceway";
  parent.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const transform = new THREE.Object3D();
  const palette = { concrete: 0xb7cebf, dark: 0x29483f, warning: 0xf3bb39 };
  function block(
    kind,
    frame,
    x,
    y,
    z,
    width,
    height,
    depth,
    followSlope = false,
  ) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    transform.position
      .copy(frame.p)
      .addScaledVector(right, x)
      .addScaledVector(forward, z);
    transform.position.y = y;
    transform.rotation.set(
      followSlope ? -Math.asin(frame.tangent.y) : 0,
      yaw,
      0,
      "YXZ",
    );
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push(transform.matrix.clone());
  }
  // Successive sluice machinery frames give speed, depth and scale cues while
  // leaving the entire physical carriageway and its aerial clearance open.
  for (const [u, height] of [
    [0.105, 27],
    [0.275, 23],
    [0.405, 24],
    [0.535, 22],
  ]) {
    const f = track.frame(u * track.length);
    for (const side of [-1, 1]) {
      const offset = side * (f.width + 10);
      const p = f.p.clone().addScaledVector(f.right, offset);
      const floor = environment.heightAt(p.x, p.z) - 2;
      const top = f.p.y + height;
      block("concrete", f, offset, (floor + top) / 2, 0, 7, top - floor, 11);
      block("warning", f, offset, f.p.y + 9, -6, 7.4, 3, 1);
      block("dark", f, offset, top + 3, 0, 12, 6, 16);
    }
    block("concrete", f, 0, f.p.y + height, 0, f.width * 2 + 27, 4, 10);
    block(
      "warning",
      f,
      0,
      f.p.y + height - 2.5,
      -5.2,
      f.width * 2 + 10,
      1,
      0.8,
    );
  }
  const [start, end] = track.config.sections.spillwayDive;
  const points = [],
    colors = [];
  const triangle = (a, b, c, color) => {
    const tint = new THREE.Color(color);
    for (const p of [a, b, c]) {
      points.push(...p.toArray());
      colors.push(tint.r, tint.g, tint.b);
    }
  };
  const quad = (a, b, c, d, color) => {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  };
  let previous;
  const count = Math.ceil(((end - start) * track.length) / 12);
  for (let i = 0; i <= count; i++) {
    const u = start + ((end - start) * i) / count;
    const f = track.frame(u * track.length);
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    const at = (offset, y) =>
      f.p.clone().addScaledVector(right, offset).setY(y);
    const inner = at(f.width + 10, f.p.y + 1.5);
    const outer = at(f.width + 55, f.p.y + 1.5);
    if (previous) {
      quad(
        previous.inner,
        inner,
        outer,
        previous.outer,
        i % 5 === 0 ? 0xa1ded4 : 0x3eaba4,
      );
      for (const offset of [f.width + 8, f.width + 58]) {
        const p = at(offset, 0);
        const floor = Math.min(environment.heightAt(p.x, p.z) - 6, f.p.y - 12);
        const top = f.p.y + (offset < f.width + 20 ? 2.2 : 4);
        block(
          "concrete",
          f,
          offset,
          (floor + top) / 2,
          0,
          5,
          top - floor,
          16,
          true,
        );
      }
    }
    previous = { inner, outer };
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const water = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  water.name = "visible-gravity-spillway";
  water.userData.range = [start, end];
  root.add(water);
  for (const [kind, matrices] of batches) {
    const material = new THREE.MeshLambertMaterial({
      color: palette[kind],
      map: textures.concrete,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(box, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return root;
}
