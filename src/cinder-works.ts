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
  const f = track.frame(0.835 * track.length, -1);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return {
    center: f.p.clone().addScaledVector(right, 180),
    right,
    forward,
    width: 60,
    depth: 100,
    floor: f.p.y - 11,
    forecourt: 180 - f.width - 20,
    approach: 450,
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
  const across = dx * site.right.x + dz * site.right.z;
  const along = dx * site.forward.x + dz * site.forward.z;
  const approachWidth =
    site.forecourt + 150 * THREE.MathUtils.clamp(-along / site.approach, 0, 1);
  const edge = Math.max(
    -across - approachWidth,
    across - site.width / 2,
    -along - site.approach,
    along - site.depth / 2,
  );
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
    pale: 0xe7bc87,
    dark: 0x302e37,
    oxide: 0xab6245,
  });
  const site = industrialSite(track, environment, 0.835, 1, 180, 60, 100, -1);
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
  box("turbine-hall", "pale", site, -15, deck + 0.8, 0, 24, 23, 84);
  box("turbine-roof", "dark", site, -15, deck + 23.8, 0, 28, 2, 90);
  box("main-header", "oxide", site, 1, deck + 0.8, 0, 5, 8, 92);
  for (const z of [-36, -18, 0, 18, 36]) {
    box("condenser-bed", "dark", site, 17, deck + 0.8, z, 22, 3, 16);
    box("condenser-bank", "pale", site, 17, deck + 3.8, z, 20, 15, 14);
    box("heat-exchanger-face", "dark", site, 17, deck + 18.8, z, 17, 0.8, 11);
    box("header-branch", "oxide", site, 9, deck + 3.8, z, 16, 6, 6);
    box("hall-intake", "dark", site, -15, deck + 5, z, 25, 10, 11);
  }
  // One grounded collector tower marks the end of the works; its width and
  // modest elevation keep the upper rim an exposed ridge, never a factory canyon.
  box("collector-base", "pale", site, -15, deck + 0.8, 37, 16, 38, 20);
  box("collector-cap", "oxide", site, -15, deck + 38.8, 37, 19, 3, 23);
  root.userData.foundations = [site];
  finish();
  return root;
}
