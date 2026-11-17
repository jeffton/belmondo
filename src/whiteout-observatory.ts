import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import {
  architecturalFooting,
  courseArchitecture,
} from "./course-architecture.ts";

/** One recognisable inner-basin installation, circled by the descending raceway. */
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
  // A common grounded caisson carries the lab, galleries and observation drum.
  // There are no isolated survey cabins competing with the primary silhouette.
  put("foundation", 0, footing.bottom, 0, 164, deck - footing.bottom, 178);
  put("shell", 0, deck, 0, 164, 4, 178);
  put("shell", 0, deck + 4, 0, 126, 17, 72);
  put("glazing", 0, deck + 12, -36.3, 114, 5, 0.6);
  put("glazing", 0, deck + 12, 36.3, 114, 5, 0.6);
  for (const x of [-58, 58]) {
    put("shell", x, deck + 4, 2, 26, 14, 136);
    put("instrument", x, deck + 18, 2, 27, 2, 138);
  }
  // The perimeter gallery follows the basin's inner edge. Its continuously
  // descending roof makes the same installation readable ahead of each apex,
  // rather than leaving the central dome permanently outside the chase view.
  const galleryStart = 0.29,
    galleryEnd = 0.449;
  const count = Math.ceil(((galleryEnd - galleryStart) * track.length) / 12);
  for (let i = 0; i < count; i++) {
    const frames = [i, i + 1].map((k) =>
      track.frame(
        (galleryStart + ((galleryEnd - galleryStart) * k) / count) *
          track.length,
      ),
    );
    const points = frames.map((f) => f.p.clone().addScaledVector(f.right, 67));
    const p = points[0].clone().lerp(points[1], 0.5);
    const d = points[1].clone().sub(points[0]);
    const yaw = Math.atan2(d.x, d.z);
    const depth = Math.hypot(d.x, d.z) + 0.5;
    const foot = architecturalFooting(environment, p, 36, depth, yaw);
    const top = p.y + 17;
    site.box(
      "foundation",
      p.clone().setY((foot.bottom + top) / 2),
      [36, top - foot.bottom, depth],
      yaw,
    );
    site.box("shell", p.clone().setY(top + 1.5), [38, 3, depth], yaw);
    const front = p
      .clone()
      .addScaledVector(
        new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
        -18.3,
      );
    site.box("glazing", front.setY(top - 7), [0.6, 7, depth], yaw);
  }
  // Two enclosed radial service galleries connect the perimeter to the lab.
  for (const u of [0.34, 0.41]) {
    const f = track.frame(u * track.length);
    const outer = f.p.clone().addScaledVector(f.right, 67);
    const d = outer.clone().sub(center).setY(0);
    const p = outer.clone().lerp(center, 0.5);
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
  const drum = new THREE.CylinderGeometry(31, 35, 27, 20);
  site.add(
    "shell",
    drum,
    new THREE.Matrix4().makeTranslation(center.x, deck + 34.5, center.z),
  );
  const ring = new THREE.CylinderGeometry(32.5, 32.5, 4, 20, 1, true);
  site.add(
    "glazing",
    ring,
    new THREE.Matrix4().makeTranslation(center.x, deck + 43, center.z),
  );
  const dome = new THREE.SphereGeometry(
    34,
    20,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  site.add(
    "shell",
    dome,
    new THREE.Matrix4().makeTranslation(center.x, deck + 48, center.z),
  );
  // One dark optical meridian, not a forest of antennae or ornamental strips.
  site.add(
    "glazing",
    new THREE.SphereGeometry(
      34.3,
      3,
      12,
      Math.PI * 1.5 - 0.07,
      0.14,
      0,
      Math.PI / 2,
    ),
    new THREE.Matrix4().makeTranslation(center.x, deck + 48, center.z),
  );
  put("instrument", 0, deck + 21, -42, 30, 3, 9);
  site.root.userData.footing = footing;
  site.root.userData.deck = deck;
  site.root.userData.spiralRange = track.config.sections.basinSpiral;
  return site.finish();
}
