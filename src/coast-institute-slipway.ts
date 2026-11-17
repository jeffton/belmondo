import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { placeStations } from "./coast-solar-landform.ts";

/** The public institute terrace and one marine railway are occupied spaces,
 * not another chain of roadside facades or decorative landing gates. */
export function buildCoastInstituteSlipway(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
  connection: { u: number; height: number },
) {
  const root = new THREE.Group();
  root.name = "coast-institute-slipway";
  parent.add(root);
  const faces: Record<string, number[]> = {
    court: [],
    retaining: [],
    slip: [],
    rail: [],
  };
  const colors = {
    court: 0x929d8a,
    retaining: 0x687471,
    slip: 0xa7aca1,
    rail: 0x7b4437,
  };
  const feet: THREE.Vector3[] = [];
  function sheet(points: THREE.Vector3[], kind: keyof typeof colors) {
    for (const i of [0, 1, 2, 0, 2, 3])
      faces[kind].push(...points[i].toArray());
  }
  function foot(p: THREE.Vector3) {
    const f = p.clone().setY(environment.heightAt(p.x, p.z) - 1);
    feet.push(f);
    return f;
  }
  const court = placeStations(0.545, 0.642, 0.004).map((u) => {
    const f = track.frame(u * track.length);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const near = f.p.clone().addScaledVector(right, -f.width - 12);
    const far = f.p.clone().addScaledVector(right, -f.width - 104);
    near.y = Math.max(f.p.y - 3, environment.heightAt(near.x, near.z) + 0.6);
    far.y = Math.max(f.p.y - 3, environment.heightAt(far.x, far.z) + 0.6);
    return { near, far, nearFoot: foot(near), farFoot: foot(far) };
  });
  for (let i = 0; i < court.length - 1; i++) {
    const a = court[i],
      b = court[i + 1];
    sheet([a.near, b.near, b.far, a.far], "court");
    sheet([a.near, a.nearFoot, b.nearFoot, b.near], "retaining");
    sheet([a.far, b.far, b.farFoot, a.farFoot], "retaining");
  }
  const f = track.frame(connection.u * track.length);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const slipPoint = (distance: number, z: number) =>
    f.p
      .clone()
      .addScaledVector(right, f.width + distance)
      .addScaledVector(forward, z)
      .setY(
        THREE.MathUtils.lerp(
          connection.height,
          -19,
          (distance - 53) / (420 - 53),
        ),
      );
  for (let i = 0; i < 16; i++) {
    const a = 53 + (i * (420 - 53)) / 16,
      b = 53 + ((i + 1) * (420 - 53)) / 16;
    const pa = slipPoint(a, -36),
      pb = slipPoint(b, -36),
      pc = slipPoint(b, 36),
      pd = slipPoint(a, 36);
    sheet([pa, pb, pc, pd], "slip");
    sheet([pa, foot(pa), foot(pb), pb], "retaining");
    sheet([pd, pc, foot(pc), foot(pd)], "retaining");
    for (const z of [-24, 24]) {
      const rail = [
        slipPoint(a, z - 1.2),
        slipPoint(b, z - 1.2),
        slipPoint(b, z + 1.2),
        slipPoint(a, z + 1.2),
      ];
      rail.forEach((p) => (p.y += 0.15));
      sheet(rail, "rail");
    }
  }
  for (const kind of Object.keys(colors) as (keyof typeof colors)[]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(faces[kind], 3),
    );
    const uv = [];
    for (let i = 0; i < faces[kind].length; i += 3)
      uv.push(faces[kind][i] / 25, faces[kind][i + 2] / 25);
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color: colors[kind],
        map: textures.concrete,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    mesh.name = `coast-${kind}`;
    root.add(mesh);
  }
  root.userData.connection = connection;
  root.userData.groundingContacts = feet;
  return root;
}
