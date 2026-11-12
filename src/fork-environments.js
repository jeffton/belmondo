import * as THREE from "three";

/** Near-field places authored against individual legacy forks, not the root spline. */
export function buildForkEnvironments(parent, track, textures, terrain) {
  const coast = track.config.name === "KAISEKI COAST";
  if (!coast && track.config.name !== "SOLAR ARRAY") return;
  const root = new THREE.Group();
  root.name = coast ? "coastal-fork-geography" : "solar-fork-infrastructure";
  parent.add(root);
  const materials = {
    rock: new THREE.MeshLambertMaterial({
      color: coast ? 0x768277 : 0xad7959,
      map: textures.rock,
      flatShading: true,
    }),
    wall: new THREE.MeshLambertMaterial({
      color: coast ? 0xb5bcb0 : 0xc3a686,
      map: textures.concrete,
      flatShading: true,
    }),
    metal: new THREE.MeshLambertMaterial({
      color: coast ? 0x405763 : 0x574c48,
      map: textures.edge,
      flatShading: true,
    }),
    panel: new THREE.MeshLambertMaterial({
      color: 0x263e52,
      map: textures.facade,
      flatShading: true,
    }),
  };
  const batches = new Map();
  const transform = new THREE.Object3D();
  // Axis-aligned Y, oriented XZ boxes include their full physical footprints.
  // Check every road branch, including bank and the airborne racing envelope.
  function box(kind, center, width, height, depth, yaw) {
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (const f of terrain.samples) {
      const delta = f.p.clone().sub(center);
      const x = Math.max(0, Math.abs(delta.dot(right)) - width / 2);
      const z = Math.max(0, Math.abs(delta.dot(forward)) - depth / 2);
      const bankRise =
        (Math.abs(f.up.x * f.right.x + f.up.z * f.right.z) * f.width) / f.up.y;
      if (
        Math.hypot(x, z) < f.width + 6 &&
        center.y + height / 2 > f.p.y - bankRise - 3 &&
        center.y - height / 2 < f.p.y + bankRise + 26
      )
        throw new Error(
          `Fork scenery intersects racing envelope: ${kind} at ${f.u}/${f.branch}`,
        );
    }
    const key = `${kind}:${Math.floor(center.x / 256)}:${Math.floor(center.z / 256)}`;
    if (!batches.has(key)) batches.set(key, { kind, matrices: [] });
    transform.position.copy(center);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  function point(f, x, y = 0) {
    return f.p
      .clone()
      .addScaledVector(
        new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
        x,
      )
      .add(new THREE.Vector3(0, y, 0));
  }
  function grounded(kind, f, x, width, depth, top) {
    const p = point(f, x);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const bottom =
      Math.min(
        ...[-1, 1].flatMap((a) =>
          [-1, 1].map((b) => {
            const foot = p
              .clone()
              .addScaledVector(right, (a * width) / 2)
              .addScaledVector(forward, (b * depth) / 2);
            return terrain.heightAt(foot.x, foot.z);
          }),
        ),
      ) - 2;
    if (bottom >= top) throw new Error("Fork structure buried by terrain");
    p.y = (bottom + top) / 2;
    box(kind, p, width, top - bottom, depth, yaw);
  }
  // The inward lane hugs a buttressed cutting. Cantilevered weather covers
  // make a sheltered rhythm without putting columns between the two lanes.
  const start = coast ? 0.345 : 0.35;
  const end = coast ? 0.395 : 0.405;
  const bays = Math.ceil(((end - start) * track.length) / 32);
  for (let i = 0; i < bays; i++) {
    const u = start + ((i + 0.5) / bays) * (end - start);
    const f = track.frame(u * track.length, -1);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const outer = -(f.width + 17);
    grounded(
      coast ? "rock" : "wall",
      f,
      outer - 14,
      28,
      26,
      f.p.y + (coast ? 39 : 46),
    );
    grounded("wall", f, outer, 5, 5, f.p.y + 42);
    box("wall", point(f, -7, 41), f.width * 2 + 24, 2, 24, yaw);
    box("metal", point(f, -7, 38), f.width * 2 + 24, 2, 2, yaw);
    if (!coast) {
      // Process ducts occupy the plant side of the arcade, never the road void.
      box("metal", point(f, outer - 8, 29), 7, 5, 30, yaw);
    }
  }
  if (!coast) {
    // The exposed lane runs beside a real collector/transmission field: low
    // arrays in the foreground, grounded pylons and busbars behind them.
    for (let i = 0; i < 9; i++) {
      const u = 0.34 + (i / 8) * 0.075;
      const f = track.frame(u * track.length, 1);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      for (const x of [f.width + 30, f.width + 62]) {
        const p = point(f, x);
        const y = terrain.heightAt(p.x, p.z);
        grounded("metal", f, x, 3, 3, y + 7);
        box("panel", point(f, x, y + 7.5 - f.p.y), 23, 1.5, 20, yaw);
      }
      const x = f.width + 100;
      const p = point(f, x);
      const top = Math.max(terrain.heightAt(p.x, p.z) + 35, f.p.y + 45);
      for (const dx of [-10, 10]) grounded("metal", f, x + dx, 3, 6, top);
      box("metal", point(f, x, top - f.p.y), 34, 3, 5, yaw);
      box("wall", point(f, x, top - f.p.y - 5), 24, 2, 3, yaw);
    }
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  for (const { kind, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      materials[kind],
      matrices.length,
    );
    mesh.name = `fork-${kind}`;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return root;
}
