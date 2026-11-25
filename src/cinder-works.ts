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

export function cinderRidgeExposure(
  ridge: ReturnType<typeof createCinderRidgeLandform>,
  x: number,
  height: number,
  z: number,
  slope: number,
) {
  const dx = x - ridge.center.x;
  const dz = z - ridge.center.z;
  const across = -(dx * ridge.right.x + dz * ridge.right.z);
  const along = dx * ridge.forward.x + dz * ridge.forward.z;
  const lip = 60 + 14 * Math.sin(along / 115);
  const flow = height - along * 0.022 + across * 0.115;
  const smooth = THREE.MathUtils.smoothstep;
  return (
    smooth(across, lip - 18, lip + 28) *
    (1 - smooth(across, 174, 225)) *
    smooth(along, -125, -52) *
    (1 - smooth(along, 415, 580)) *
    smooth(flow, 37, 52) *
    (1 - smooth(flow, 96, 122)) *
    smooth(slope, 0.17, 0.55)
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
    pale: 0xb9a18f,
    dark: 0x302c38,
    oxide: 0xa95742,
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
  const y = deck + 0.8;
  box("turbine-hall", "pale", site, -13, y, 3, 27, 24, 83);
  box("recessed-loading-face", "dark", site, -12, y + 1, -39.5, 19, 16, 2);
  box("receiving-canopy", "pale", site, -12, y + 17, -42, 27, 4, 14);
  box("clerestory", "dark", site, -14, y + 24, 8, 23, 5, 68);
  box("turbine-roof", "rock", site, -14, y + 29, 6, 28, 2, 75);
  box("main-header", "oxide", site, 4, y + 3, 2, 7, 6, 86);
  for (const z of [-27, -1, 25]) {
    box("condenser-bed", "dark", site, 17, y, z, 23, 4, 20);
    box("condenser-bank", "pale", site, 17, y + 4, z, 19, 15, 18);
    box("heat-exchanger-face", "dark", site, 17, y + 19, z, 16, 1.2, 15);
    box("header-branch", "oxide", site, 9, y + 4, z, 16, 5, 6);
  }
  for (const x of [-23, -11])
    box("collector-stack", "dark", site, x, y + 31, 34, 6, 17, 13);
  box("collector-head", "oxide", site, -17, y + 48, 34, 24, 4, 16);
  root.userData.foundations = [site];
  finish();
  return root;
}
