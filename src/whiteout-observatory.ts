import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  architecturalFooting,
  courseArchitecture,
} from "./course-architecture.ts";

/** One optical installation: an incoming dome and a continuous vaulted rim lab. */
export function buildWhiteoutObservatory(
  parent: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const site = courseArchitecture(
    parent,
    "whiteout-basin-observatory",
    textures,
    {
      foundation: { color: 0x416378, map: "concrete" },
      shell: { color: 0xe0f4f4, map: "paint" },
      glazing: { color: 0x235d83, map: null },
      instrument: { color: 0xf47e35, map: "paint" },
    },
  );
  const center = new THREE.Vector3(-10, 0, -8);
  const footing = architecturalFooting(environment, center, 164, 178);
  const deck = Math.max(114, footing.top);
  const put = (
    kind: string,
    x: number,
    low: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ) =>
    site.box(
      kind,
      new THREE.Vector3(center.x + x, low + height / 2, center.z + z),
      [width, height, depth],
    );
  put("foundation", 0, footing.bottom, 0, 164, deck - footing.bottom, 178);
  put("shell", 0, deck, 0, 164, 4, 178);
  put("shell", 0, deck + 4, 0, 126, 17, 72);
  for (const z of [-36.3, 36.3]) put("glazing", 0, deck + 12, z, 114, 5, 0.6);
  for (const x of [-58, 58]) {
    put("shell", x, deck + 4, 2, 26, 14, 136);
    put("instrument", x, deck + 18, 2, 27, 2, 138);
  }
  // A glass-fronted lab follows the inner rim close enough to enter the narrow
  // portrait sightline. Its continuous optical vault, not facade decoration,
  // gives the installation the same recognisable silhouette through the spiral.
  const start = 0.29,
    end = 0.449;
  const count = Math.ceil(((end - start) * track.length) / 12);
  const frames = Array.from({ length: count + 1 }, (_, i) =>
    track.frame((start + ((end - start) * i) / count) * track.length),
  );
  const centers = frames.map((f) =>
    f.p
      .clone()
      .addScaledVector(
        new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
        44,
      ),
  );
  const roof: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    roof.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  const profile = (i: number) => {
    const f = frames[i],
      p = centers[i];
    const right = new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize();
    return Array.from({ length: 13 }, (_, k) =>
      p
        .clone()
        .addScaledVector(right, Math.cos((k * Math.PI) / 12) * 18)
        .setY(p.y + 13 + Math.sin((k * Math.PI) / 12) * 18),
    );
  };
  const profiles = frames.map((_, i) => profile(i));
  for (let i = 0; i < count; i++) {
    const a = centers[i],
      b = centers[i + 1];
    const p = a.clone().lerp(b, 0.5),
      d = b.clone().sub(a);
    const yaw = Math.atan2(d.x, d.z),
      depth = Math.hypot(d.x, d.z) + 0.5;
    const foot = architecturalFooting(environment, p, 36, depth, yaw);
    const plinth = p.y + 3;
    site.box(
      "foundation",
      p.clone().setY((foot.bottom + plinth) / 2),
      [36, plinth - foot.bottom, depth],
      yaw,
    );
    site.box("shell", p.clone().setY(p.y + 8), [36, 10, depth], yaw);
    const front = p
      .clone()
      .addScaledVector(
        new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
        -18.3,
      );
    site.box("glazing", front.setY(p.y + 8.5), [0.6, 7, depth], yaw);
    for (let k = 0; k < 12; k++) {
      triangle(profiles[i][k], profiles[i + 1][k + 1], profiles[i + 1][k]);
      triangle(profiles[i][k], profiles[i][k + 1], profiles[i + 1][k + 1]);
    }
  }
  for (const i of [0, count]) {
    const p = centers[i].clone().setY(centers[i].y + 13);
    for (let k = 0; k < 12; k++) {
      if (i === 0) triangle(p, profiles[i][k + 1], profiles[i][k]);
      else triangle(p, profiles[i][k], profiles[i][k + 1]);
    }
  }
  const vault = new THREE.BufferGeometry();
  vault.setAttribute("position", new THREE.Float32BufferAttribute(roof, 3));
  const uv: number[] = [];
  for (let i = 0; i < roof.length; i += 3)
    uv.push(roof[i] / 24, roof[i + 2] / 24);
  vault.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  vault.setIndex(Array.from({ length: roof.length / 3 }, (_, i) => i));
  vault.computeVertexNormals();
  site.add("shell", vault, new THREE.Matrix4());
  // Enclosed radial service galleries join the rim lab to the common core.
  for (const u of [0.34, 0.41]) {
    const f = track.frame(u * track.length),
      outer = f.p.clone().addScaledVector(f.right, 44);
    const d = outer.clone().sub(center).setY(0),
      p = outer.clone().lerp(center, 0.5);
    const yaw = Math.atan2(d.x, d.z);
    const foot = architecturalFooting(environment, p, 18, d.length(), yaw);
    const top = Math.max(deck + 12, outer.y + 10);
    site.box(
      "foundation",
      p.clone().setY((foot.bottom + top) / 2),
      [18, top - foot.bottom, d.length()],
      yaw,
    );
    site.box("shell", p.clone().setY(top + 1), [20, 2, d.length()], yaw);
  }
  // One optical dome occupies the incoming rim, not the always-sideways basin
  // centre. The dome and the continuous laboratory vault share their roof form.
  const f = track.frame(0.33 * track.length);
  const optical = f.p
    .clone()
    .addScaledVector(
      new THREE.Vector3(f.tangent.z, 0, -f.tangent.x).normalize(),
      66,
    );
  const opticalDeck = f.p.y - 4;
  const opticalFoot = architecturalFooting(environment, optical, 80, 80);
  const at = (height: number) =>
    new THREE.Matrix4().makeTranslation(optical.x, height, optical.z);
  site.add(
    "foundation",
    new THREE.CylinderGeometry(40, 40, opticalDeck - opticalFoot.bottom, 20),
    at((opticalDeck + opticalFoot.bottom) / 2),
  );
  site.add(
    "shell",
    new THREE.CylinderGeometry(35, 40, 27, 20),
    at(opticalDeck + 13.5),
  );
  site.add(
    "glazing",
    new THREE.CylinderGeometry(36.5, 36.5, 4, 20, 1, true),
    at(opticalDeck + 22),
  );
  site.add(
    "shell",
    new THREE.SphereGeometry(38, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    at(opticalDeck + 27),
  );
  site.add(
    "glazing",
    new THREE.SphereGeometry(
      38.3,
      3,
      12,
      Math.PI * 1.5 - 0.07,
      0.14,
      0,
      Math.PI / 2,
    ),
    at(opticalDeck + 27),
  );
  put("instrument", 0, deck + 21, -42, 30, 3, 9);
  site.root.userData.footing = footing;
  site.root.userData.deck = deck;
  site.root.userData.spiralRange = track.config.sections.basinSpiral;
  return site.finish();
}
