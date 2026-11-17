import * as THREE from "three";
import type { Track } from "./track.ts";
import type { CircuitTextures, EnvironmentSurface } from "./environment.ts";
import { industrialSite, industrialMeshes } from "./industrial-site.ts";

export const NIGHT_HARBOR_SEA = -16;
export const NIGHT_HARBOR_QUAY = NIGHT_HARBOR_SEA + 6;

/** Shared basin geometry for the visible harbor and the terrain's base layer. */
export function createNightHarborBasin(track: Track) {
  const f = track.frame(0.723 * track.length);
  const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  return {
    center: f.p.clone().addScaledVector(right, -160),
    right,
    forward,
    width: 1200,
    depth: 2600,
  };
}

/** Apply to the harbor BASE, before its existing road grading and cell clearance. */
export function nightHarborBaseHeight(
  basin: ReturnType<typeof createNightHarborBasin>,
  x: number,
  z: number,
  base: number,
) {
  const dx = x - basin.center.x,
    dz = z - basin.center.z;
  const across = Math.abs(dx * basin.right.x + dz * basin.right.z);
  const along = Math.abs(dx * basin.forward.x + dz * basin.forward.z);
  const shore = Math.max(across - basin.width / 2, along - basin.depth / 2);
  const weight = 1 - THREE.MathUtils.smoothstep(shore, -80, 80);
  return THREE.MathUtils.lerp(
    base,
    Math.min(base, NIGHT_HARBOR_SEA - 9),
    weight,
  );
}

/** One working harbor seen from the ascending deck, crossing and bridge exit. */
export function buildNightHarbor(
  scene: THREE.Object3D,
  track: Track,
  textures: CircuitTextures,
  environment: EnvironmentSurface,
) {
  const root = new THREE.Group();
  root.name = "night-harbor-basin";
  scene.add(root);
  const { box, finish } = industrialMeshes(root, textures, {
    quay: 0x617b92,
    pale: 0xbacbd1,
    dark: 0x233547,
    cargo: 0x9e446d,
    metal: 0x337f8d,
  });
  const sites = [
    industrialSite(
      track,
      environment,
      0.655,
      -1,
      360,
      190,
      560,
      0,
      NIGHT_HARBOR_QUAY,
    ),
    industrialSite(
      track,
      environment,
      0.8,
      -1,
      360,
      190,
      560,
      0,
      NIGHT_HARBOR_QUAY,
    ),
    industrialSite(
      track,
      environment,
      0.902,
      1,
      280,
      210,
      240,
      0,
      NIGHT_HARBOR_QUAY,
    ),
  ];
  for (const [i, site] of sites.entries()) {
    const { width: w, depth: d, deck, bottom } = site;
    if (i === 0) {
      // A wet repair berth: seawater occupies the open centre. Its long
      // retained shoulders intersect the seabed, rather than floating above it.
      // No upper chord or suspended piece crosses either crossing level.
      for (const x of [-1, 1]) {
        box(
          `dock-wall-${i}`,
          "pale",
          site,
          x * (w / 2 - 18),
          bottom,
          0,
          28,
          deck - bottom,
          d - 12,
        );
        box(
          `rail-${i}`,
          "metal",
          site,
          x * (w / 2 - 18),
          deck,
          0,
          3,
          1,
          d - 12,
        );
      }
      box(
        `dock-head-foundation-${i}`,
        "quay",
        site,
        0,
        bottom,
        d / 2 - 22,
        w - 18,
        deck - bottom,
        32,
      );
      box(`dock-head-${i}`, "pale", site, 0, deck, d / 2 - 22, w - 18, 30, 32);
      box(
        `dock-head-roof-${i}`,
        "dark",
        site,
        0,
        deck + 30,
        d / 2 - 22,
        w - 12,
        3,
        38,
      );
      // Functional stepped hull blocks make the long empty repair bed legible.
      box(
        `hull-keel-${i}`,
        "metal",
        site,
        0,
        NIGHT_HARBOR_SEA - 6,
        -18,
        44,
        7,
        d * 0.62,
      );
      box(
        `hull-body-${i}`,
        "quay",
        site,
        0,
        NIGHT_HARBOR_SEA + 1,
        -18,
        60,
        12,
        d * 0.53,
      );
      box(
        `hull-deck-${i}`,
        "pale",
        site,
        0,
        NIGHT_HARBOR_SEA + 13,
        -18,
        56,
        2,
        d * 0.49,
      );
      box(
        `hull-superstructure-${i}`,
        "dark",
        site,
        0,
        NIGHT_HARBOR_SEA + 15,
        d * 0.12,
        32,
        13,
        46,
      );
    } else if (i === 1) {
      box("freight-quay", "quay", site, 0, bottom, 0, w, deck - bottom, d);
      box("freight-apron", "dark", site, 0, deck, 0, w - 6, 0.8, d - 6);
      box("transfer-hall", "pale", site, 38, deck + 0.8, 0, 82, 28, d - 48);
      box(
        "transfer-hall-roof",
        "dark",
        site,
        38,
        deck + 28.8,
        0,
        88,
        3,
        d - 40,
      );
      box("loading-spine", "metal", site, -20, deck + 0.8, 0, 24, 8, d - 30);
      for (const z of [-190, -95, 0, 95, 190]) {
        box(
          "cargo-transfer-bay",
          "cargo",
          site,
          -60,
          deck + 0.8,
          z,
          42,
          15,
          66,
        );
        box("transfer-link", "pale", site, -28, deck + 0.8, z, 22, 5, 12);
      }
    } else {
      box("terminal-quay", "quay", site, 0, bottom, 0, w, deck - bottom, d);
      box("terminal-apron", "dark", site, 0, deck, 0, w - 8, 0.6, d - 8);
      // The descent aims toward a terminal, not a random tall waterfront box.
      // Two grounded freight halls share a low transfer apron and one tower.
      for (const x of [-52, 52]) {
        box("terminal-hall", "pale", site, x, deck, 0, 88, 38, 178);
        box("terminal-roof", "dark", site, x, deck + 38, 0, 94, 4, 184);
        for (const z of [-60, -20, 20, 60]) {
          box("loading-door", "dark", site, x, deck + 3, z, 89, 17, 16);
          box("door-lintel", "cargo", site, x, deck + 20, z, 90, 3, 18);
        }
      }
      box("terminal-transfer-spine", "metal", site, 0, deck, 0, 14, 17, 210);
      box("terminal-control", "pale", site, 0, deck, 92, 32, 76, 30);
      box(
        "terminal-control-window",
        "dark",
        site,
        0,
        deck + 56,
        92,
        33,
        12,
        31,
      );
      box("terminal-control-cap", "cargo", site, 0, deck + 76, 92, 38, 5, 36);
    }
  }
  root.userData.foundations = sites;
  finish();
  return root;
}
