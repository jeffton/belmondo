import * as THREE from "three";
import type { EnvironmentSurface } from "./environment.ts";
import type { Track, TrackFrame } from "./track.ts";

export function nightViaductSpan(track: Track) {
  return track.config.name === "NOCTILUCENT"
    ? track.config.sections.upperBridge
    : undefined;
}

/** Midnight freight loop: split concrete pylons carry a continuous steel deck. */
export function buildNightViaduct(
  track: Track,
  environment: Pick<EnvironmentSurface, "heightAt">,
  span: readonly [number, number],
) {
  const root = new THREE.Group();
  root.name = "upper-crossing-truss";

  const box = new THREE.BoxGeometry();
  const blade = new THREE.BoxGeometry();
  const vertices = blade.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    // Cast sections flare at the base and sharpen at the top.
    const taper = vertices.getY(i) > 0 ? 0.67 : 1;
    vertices.setX(i, vertices.getX(i) * taper);
    vertices.setZ(i, vertices.getZ(i) * taper);
  }
  blade.computeVertexNormals();
  const batches = [
    { name: "pylon-blades", geometry: blade, color: 0x9daec5 },
    { name: "caissons-and-bearings", geometry: box, color: 0x526680 },
    { name: "oxide-painted-steel", geometry: box, color: 0xa65653 },
    { name: "maintenance-lamps", geometry: box, color: 0xffba81 },
  ].map((batch) => ({ ...batch, matrices: [] as THREE.Matrix4[] }));
  const [concrete, hardware, steel, lamps] = batches;
  const vertical = new THREE.Vector3(0, 1, 0);
  const transform = new THREE.Object3D();
  const basis = new THREE.Matrix4();
  function beam(
    batch: (typeof batches)[number],
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth: number,
    crosswise: THREE.Vector3,
  ) {
    const length = a.distanceTo(b);
    const axis = b.clone().sub(a).normalize();
    const normal = new THREE.Vector3()
      .crossVectors(crosswise, axis)
      .normalize();
    const lateral = new THREE.Vector3().crossVectors(axis, normal);
    transform.position.copy(a).lerp(b, 0.5);
    transform.quaternion.setFromRotationMatrix(
      basis.makeBasis(lateral, axis, normal),
    );
    transform.scale.set(width, length, depth);
    transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  }

  const frame = (t: number) =>
    track.frame(THREE.MathUtils.lerp(...span, t) * track.length);
  const offset = (f: TrackFrame, x: number, y: number) =>
    f.p.clone().addScaledVector(f.right, x).addScaledVector(vertical, y);

  // Longer bays give the harbor a legible silhouette, including one clear
  // central span over the lower circuit. The deck enters the cliffs at each end.
  const supports = [0.08, 0.24, 0.38, 0.59, 0.75, 0.91];
  const boundaries = [0, ...supports, 1];
  for (const [i, start] of boundaries.slice(0, -1).entries()) {
    const end = boundaries[i + 1];
    const panels = Math.ceil(
      ((end - start) * (span[1] - span[0]) * track.length) / 28,
    );
    for (let panel = 0; panel < panels; panel++) {
      const a = frame(THREE.MathUtils.lerp(start, end, panel / panels));
      const b = frame(THREE.MathUtils.lerp(start, end, (panel + 1) / panels));
      const depth = (j: number) => {
        const t = j / panels;
        const haunch = 23 - 14 * Math.sin(Math.PI * t);
        // Taper into the cliff abutments rather than leaving an open truss end.
        const bearing = i === 0 ? t : i === boundaries.length - 2 ? 1 - t : 1;
        return THREE.MathUtils.lerp(5.5, haunch, Math.min(1, 2 * bearing));
      };
      beam(
        hardware,
        offset(a, 15, -4.8),
        offset(a, -15, -4.8),
        2,
        2,
        a.tangent,
      );
      for (const side of [-1, 1]) {
        const topA = offset(a, side * 15, -3.7);
        const topB = offset(b, side * 15, -3.7);
        const lowA = offset(a, side * 15, -depth(panel));
        const lowB = offset(b, side * 15, -depth(panel + 1));
        beam(hardware, topA, topB, 2.8, 3, a.right);
        beam(steel, lowA, lowB, 2.3, 2.5, a.right);
        beam(steel, topA, lowA, 1.3, 1.5, a.right);
        beam(
          steel,
          panel % 2 ? topA : lowA,
          panel % 2 ? lowB : topB,
          1.5,
          1.6,
          a.right,
        );
      }
    }
  }

  const groundingContacts = [];
  for (const t of supports) {
    const f = frame(t);
    const crosswise = f.right.clone().setY(0).normalize();
    const crossbeam = (x: number, y: number) => offset(f, x, y);
    // The two shafts lean towards a narrow waist. Raked heads transfer the
    // deck load back out to the truss; transverse ties keep the legs together.
    for (const side of [-1, 1]) {
      const foot = crossbeam(side * 24, 0);
      foot.y = environment.heightAt(foot.x, foot.z) - 6;
      groundingContacts.push(foot);
      const knee = crossbeam(side * 7, -72);
      const head = crossbeam(side * 15, -24);
      beam(
        hardware,
        foot,
        foot.clone().addScaledVector(vertical, 25),
        29,
        32,
        crosswise,
      );
      beam(concrete, foot, knee, 15, 22, crosswise);
      beam(concrete, knee, head, 11, 16, crosswise);
      beam(
        hardware,
        offset(f, side * 7, -74),
        offset(f, side * 7, -70),
        12,
        18,
        crosswise,
      );
      beam(hardware, head, offset(f, side * 15, -20.5), 11, 14, crosswise);
      beam(
        lamps,
        offset(f, side * 20.5, -23.75).addScaledVector(f.tangent, -5),
        offset(f, side * 20.5, -23.75).addScaledVector(f.tangent, 5),
        1.1,
        1.25,
        crosswise,
      );
    }
    for (const along of [-6, 6]) {
      const node = (x: number, y: number) =>
        crossbeam(x, y).addScaledVector(f.tangent, along);
      beam(steel, node(-8, -72), node(8, -72), 4.2, 3.2, f.tangent);
      beam(steel, node(-13, -48), node(13, -48), 3.4, 3.2, f.tangent);
      beam(steel, node(-8, -72), node(11, -48), 2.4, 2.8, f.tangent);
      beam(steel, node(8, -72), node(-11, -48), 2.4, 2.8, f.tangent);
    }
  }

  for (const { name, geometry, color, matrices } of batches) {
    const material =
      name === "maintenance-lamps"
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshLambertMaterial({ color, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.groundingContacts = groundingContacts;
  return root;
}
