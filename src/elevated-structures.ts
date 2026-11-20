import * as THREE from "three";
import type { EnvironmentSurface } from "./environment.ts";
import type { Track, TrackFrame } from "./track.ts";

type Range = readonly [number, number];
const designs = {
  "PALM BREAKER": {
    name: "inlet-causeway",
    range: [0.329, 0.414] as Range,
    branch: 1,
    palette: [0xeee0be, 0x477f83, 0xffb67a],
  },
  WHITEOUT: {
    name: "glacier-ravine-lattice",
    range: [0.209, 0.234] as Range,
    branch: 0,
    palette: [0xa9bdc5, 0x345a72, 0xc88c54],
  },
  CINDERLINE: {
    name: "caldera-haul-trestle",
    range: [0.805, 0.852] as Range,
    branch: 1,
    palette: [0x69534d, 0x593c38, 0xcb813f],
  },
};

export function elevatedDesign(track: Track) {
  return designs[track.config.name as keyof typeof designs];
}

export function buildElevatedStructure(
  track: Track,
  environment: Pick<EnvironmentSurface, "heightAt">,
) {
  const design = elevatedDesign(track);
  if (!design) return;
  const { name, range, branch, palette } = design;
  const root = new THREE.Group();
  root.name = name;
  const solid = new THREE.BoxGeometry();
  const cast = new THREE.BoxGeometry();
  const vertices = cast.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const taper = vertices.getY(i) > 0 ? 0.72 : 1;
    vertices.setX(i, vertices.getX(i) * taper);
    vertices.setZ(i, vertices.getZ(i) * taper);
  }
  cast.computeVertexNormals();
  const batches = [solid, cast, solid, solid].map((geometry, i) => ({
    geometry,
    color: palette[i < 2 ? 0 : i - 1],
    matrices: [] as THREE.Matrix4[],
  }));
  const [concrete, pier, steel, fittings] = batches;
  const obj = new THREE.Object3D();
  const basis = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  function beam(
    batch: (typeof batches)[number],
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth: number,
    right: THREE.Vector3,
  ) {
    const axis = b.clone().sub(a).normalize();
    const normal = new THREE.Vector3().crossVectors(right, axis).normalize();
    const across = new THREE.Vector3().crossVectors(axis, normal);
    obj.quaternion.setFromRotationMatrix(basis.makeBasis(across, axis, normal));
    obj.position.copy(a).lerp(b, 0.5);
    obj.scale.set(width, a.distanceTo(b), depth);
    obj.updateMatrix();
    batch.matrices.push(obj.matrix.clone());
  }
  const frame = (u: number) => track.frame(u * track.length, branch);
  const deck = (f: TrackFrame, x: number, y: number) =>
    f.p.clone().addScaledVector(f.right, x).addScaledVector(f.up, y);
  const contacts: THREE.Vector3[] = [];
  function foot(
    f: TrackFrame,
    x: number,
    along: number,
    width: number,
    depth: number,
  ) {
    const right = f.right.clone().setY(0).normalize();
    const fore = new THREE.Vector3().crossVectors(right, up);
    const base = deck(f, x, 0).addScaledVector(fore, along);
    // Bury the complete base, including its downhill corner on the caldera.
    const corners = [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        base
          .clone()
          .addScaledVector(right, (side * width) / 2)
          .addScaledVector(fore, (end * depth) / 2),
      ),
    );
    base.y =
      Math.min(
        environment.heightAt(base.x, base.z),
        ...corners.map((p) => environment.heightAt(p.x, p.z)),
      ) - 2;
    contacts.push(base, ...corners.map((p) => p.setY(base.y)));
    return base;
  }
  const panels = Math.ceil(((range[1] - range[0]) * track.length) / 28);
  for (let i = 0; i < panels; i++) {
    const a = frame(THREE.MathUtils.lerp(...range, i / panels));
    const b = frame(THREE.MathUtils.lerp(...range, (i + 1) / panels));
    for (const side of [-1, 1]) {
      const x =
        side * (branch === 0 ? 15 : name === "inlet-causeway" ? 13 : 16);
      // Seat the top flange into the rendered deck's two-metre underside.
      const aTop = deck(a, x, -3.35);
      const bTop = deck(b, x, -3.35);
      const girderDepth = (j: number) => {
        const t = j / panels;
        if (name === "glacier-ravine-lattice")
          return 8 + 10 * Math.sin(Math.PI * t);
        if (name === "caldera-haul-trestle")
          return 7 + 4 * Math.sin(Math.PI * t);
        return 8 + 2 * Math.sin(Math.PI * t);
      };
      const aLow = deck(a, x, -girderDepth(i));
      const bLow = deck(b, x, -girderDepth(i + 1));
      beam(steel, aTop, bTop, 2.7, 3.8, a.right);
      if (name === "inlet-causeway") {
        beam(
          concrete,
          aTop.clone().lerp(aLow, 0.65),
          bTop.clone().lerp(bLow, 0.65),
          3.1,
          4.6,
          a.right,
        );
      } else {
        beam(steel, aLow, bLow, 2.35, 2.4, a.right);
        beam(
          steel,
          i % 2 ? aLow : aTop,
          i % 2 ? bTop : bLow,
          1.7,
          1.9,
          a.right,
        );
        if (i % 2 === 0) beam(fittings, aTop, aLow, 1.9, 2.05, a.right);
      }
    }
  }
  function bearing(f: TrackFrame, x: number, y: number, depth: number) {
    beam(concrete, deck(f, -x, y), deck(f, x, y), depth, 3.7, f.tangent);
  }
  if (name === "inlet-causeway") {
    // Tall cast columns sit on tidal caissons. Their broad manta-shaped heads
    // carry the two girder lines without intrusive towers or stays over the road.
    for (const u of [0.335, 0.348, 0.364, 0.381, 0.397, 0.408]) {
      const f = frame(u);
      const ground = foot(f, 0, 0, 30, 34);
      const plinth = ground.clone().addScaledVector(up, 34);
      const neck = deck(f, 0, -32);
      beam(steel, ground, plinth, 30, 34, f.right);
      beam(pier, plinth, neck, 15.5, 20, f.right);
      beam(steel, deck(f, 0, -61), deck(f, 0, -57), 12, 17, f.right);
      for (const side of [-1, 1]) {
        beam(
          pier,
          neck.clone().addScaledVector(f.right, side * 2),
          deck(f, side * 14, -10),
          10.8,
          15,
          f.right,
        );
        beam(
          fittings,
          deck(f, side * 12, -12),
          deck(f, side * 14, -9),
          4.3,
          15.3,
          f.right,
        );
      }
      bearing(f, 15, -8, 16);
    }
  } else if (name === "glacier-ravine-lattice") {
    // Hold the span at the two rock shoulders, leaving the lower road open.
    for (const u of [0.211, 0.233]) {
      const f = frame(u);
      for (const side of [-1, 1]) {
        const base = foot(f, side * 14, 0, 12, 13);
        const cap = deck(f, side * 14, -12);
        if (cap.y > base.y) beam(pier, base, cap, 12, 13, f.right);
        beam(
          fittings,
          deck(f, side * 14, -12),
          deck(f, side * 14, -8),
          7.5,
          8,
          f.right,
        );
      }
      bearing(f, 16, -7, 9);
    }
  } else {
    // Riveted A-bents echo the ore handling equipment rather than the city
    // road supports. Each pair flares longitudinally down to rock shoes.
    for (const u of [0.811, 0.825, 0.838, 0.847]) {
      const f = frame(u);
      for (const side of [-1, 1]) {
        const cap = deck(f, side * 12, -10);
        for (const direction of [-1, 1]) {
          const base = foot(f, side * 12, direction * 9, 6, 7);
          if (base.y >= cap.y - 1) continue;
          const shoe = base.clone().addScaledVector(up, 2.2);
          beam(concrete, base, shoe, 6, 7, f.right);
          beam(steel, shoe, cap, 2.9, 3.25, f.right);
        }
        beam(fittings, cap, deck(f, side * 12, -7.5), 5.7, 7, f.right);
      }
      bearing(f, 17, -7, 8);
    }
  }
  for (const { geometry, color, matrices } of batches) {
    if (!matrices.length) continue;
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
      matrices.length,
    );
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.groundingContacts = contacts;
  return root;
}
