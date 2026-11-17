import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { industrialSite, industrialMeshes } from "./industrial-site.ts";

/** A retained ridge emerges from the caldera and points at the receiving deck. */
export function createCinderRidgeLandform(track: Track) {
  const f = track.frame(0.552 * track.length);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return {
    center: f.p.clone(),
    right,
    forward,
    halfLength: 760,
    halfWidth: 620,
    floor: 15,
  };
}

/** Apply to biomeLandHeight's volcanic BASE, before road grading. The existing
 * grading then carries the exact road on one continuous exposed rock backbone.
 */
export function cinderRidgeBaseHeight(
  ridge: ReturnType<typeof createCinderRidgeLandform>,
  x: number,
  z: number,
  height: number,
) {
  const dx = x - ridge.center.x,
    dz = z - ridge.center.z;
  const across = Math.abs(dx * ridge.right.x + dz * ridge.right.z);
  const along = Math.abs(dx * ridge.forward.x + dz * ridge.forward.z);
  const outer =
    1 -
    THREE.MathUtils.smoothstep(across, ridge.halfWidth - 120, ridge.halfWidth);
  const length =
    1 -
    THREE.MathUtils.smoothstep(along, ridge.halfLength - 120, ridge.halfLength);
  return THREE.MathUtils.lerp(
    height,
    Math.min(height, ridge.floor),
    outer * length,
  );
}

/** Shared excavation footprint: a low working shelf cut into the basalt gorge. */
export function createCinderWorksLandform(track: Track) {
  const f = track.frame(0.818 * track.length, -1);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return {
    center: f.p.clone().addScaledVector(right, -170),
    right,
    forward,
    width: 136,
    depth: 310,
    floor: f.p.y - 36,
  };
}

/** Apply AFTER the volcanic gorge shaping, BEFORE whole-cell deck clearance. */
export function cinderWorksLandHeight(
  site: ReturnType<typeof createCinderWorksLandform>,
  x: number,
  z: number,
  height: number,
) {
  const dx = x - site.center.x,
    dz = z - site.center.z;
  const across = Math.abs(dx * site.right.x + dz * site.right.z);
  const along = Math.abs(dx * site.forward.x + dz * site.forward.z);
  const edge = Math.max(across - site.width / 2, along - site.depth / 2);
  // The 24 m collar contains the terrain grid's boundary triangles. The slope
  // beyond it rejoins the basalt; the finished slab never hides a hillside.
  const weight = 1 - THREE.MathUtils.smoothstep(edge, 24, 60);
  return THREE.MathUtils.lerp(height, Math.min(height, site.floor), weight);
}

/** A single low condenser works sits in the gorge, below the open rim horizon. */
export function buildCinderWorks(
  scene: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const root = new THREE.Group();
  root.name = "cinder-gorge-works";
  scene.add(root);
  const { box, finish } = industrialMeshes(root, textures, {
    rock: 0x49424a,
    pale: 0xd3d1bb,
    dark: 0x343b43,
    oxide: 0x9f5940,
  });
  const site = industrialSite(track, environment, 0.818, -1, 170, 136, 310, -1);
  const { deck, bottom, width, depth } = site;
  box(
    "basalt-retaining-plinth",
    "rock",
    site,
    0,
    bottom,
    0,
    width,
    deck - bottom,
    depth,
  );
  box("works-apron", "pale", site, 0, deck, 0, width - 4, 0.8, depth - 4);
  // A long pale turbine hall, outdoor condenser banks and a common header
  // establish one installation with a readable cross-section, not copied stacks.
  box("turbine-hall", "pale", site, -35, deck + 0.8, 0, 54, 23, 270);
  box("turbine-roof", "dark", site, -35, deck + 23.8, 0, 58, 2, 276);
  box("main-header", "oxide", site, 4, deck + 0.8, 0, 12, 8, 284);
  for (const z of [-112, -56, 0, 56, 112]) {
    box("condenser-bed", "dark", site, 39, deck + 0.8, z, 48, 3, 40);
    box("condenser-bank", "pale", site, 39, deck + 3.8, z, 44, 15, 36);
    box("heat-exchanger-face", "dark", site, 39, deck + 18.8, z, 37, 0.8, 27);
    box("header-branch", "oxide", site, 23, deck + 3.8, z, 38, 6, 6);
    box("hall-intake", "dark", site, -35, deck + 5, z, 55, 10, 21);
  }
  // One grounded collector tower marks the end of the works; its width and
  // modest elevation keep the upper rim an exposed ridge, never a factory canyon.
  box("collector-base", "pale", site, -35, deck + 0.8, 133, 30, 38, 28);
  box("collector-cap", "oxide", site, -35, deck + 38.8, 133, 33, 3, 31);
  root.userData.foundations = [site];
  finish();
  return root;
}
