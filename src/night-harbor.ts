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
  const reachFrame = track.frame(0.858 * track.length);
  const reachForward = new THREE.Vector3(
    reachFrame.tangent.x,
    0,
    reachFrame.tangent.z,
  ).normalize();
  const reachRight = new THREE.Vector3(reachForward.z, 0, -reachForward.x);
  return {
    center: f.p.clone().addScaledVector(right, -160),
    right,
    forward,
    width: 1200,
    depth: 2600,
    reach: {
      center: reachFrame.p.clone().addScaledVector(reachRight, -320),
      right: reachRight,
      forward: reachForward,
      width: 340,
      depth: 1660,
    },
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
  const rdx = x - basin.reach.center.x,
    rdz = z - basin.reach.center.z;
  const reachEdge = Math.max(
    Math.abs(rdx * basin.reach.right.x + rdz * basin.reach.right.z) -
      basin.reach.width / 2,
    Math.abs(rdx * basin.reach.forward.x + rdz * basin.reach.forward.z) -
      basin.reach.depth / 2,
  );
  const weight =
    1 - THREE.MathUtils.smoothstep(Math.min(shore, reachEdge), -80, 80);
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
      0.858,
      -1,
      320,
      180,
      1500,
      0,
      NIGHT_HARBOR_QUAY,
    ),
    industrialSite(
      track,
      environment,
      0.9,
      -1,
      360,
      320,
      500,
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
    } else if (i === 2) {
      box(
        "connected-transfer-quay",
        "quay",
        site,
        0,
        bottom,
        0,
        w,
        deck - bottom,
        d,
      );
      box(
        "connected-transfer-apron",
        "dark",
        site,
        0,
        deck,
        0,
        w - 6,
        0.8,
        d - 6,
      );
      box(
        "continuous-freight-header",
        "metal",
        site,
        0,
        deck + 0.8,
        0,
        22,
        6,
        d - 30,
      );
      for (const z of [-620, -310, 0, 310, 620]) {
        box(
          "quayside-freight-hall",
          "pale",
          site,
          45,
          deck + 0.8,
          z,
          68,
          28,
          210,
        );
        box(
          "quayside-freight-roof",
          "dark",
          site,
          45,
          deck + 28.8,
          z,
          72,
          3,
          216,
        );
        box(
          "cargo-loading-bay",
          "cargo",
          site,
          -44,
          deck + 0.8,
          z,
          64,
          18,
          170,
        );
      }
    } else {
      box("terminal-quay", "quay", site, 0, bottom, 0, w, deck - bottom, d);
      box("terminal-apron", "dark", site, 0, deck, 0, w - 8, 0.6, d - 8);
      // A terraced freight interchange terminates the high-deck sightline.
      // Its lifting spine rises FROM the quay; every setback bears on a wider
      // occupied mass. The bridge itself remains completely open.
      for (const x of [-65, 65]) {
        box("terminal-hall", "pale", site, x, deck, 0, 100, 90, 240);
        box("terminal-hall-roof", "dark", site, x, deck + 90, 0, 106, 4, 246);
        for (const z of [-84, 0, 84]) {
          box("loading-door", "dark", site, x, deck + 3, z, 101, 34, 34);
          box("door-lintel", "cargo", site, x, deck + 37, z, 102, 6, 36);
        }
      }
      box(
        "terminal-upper-transfer",
        "pale",
        site,
        0,
        deck + 90,
        30,
        140,
        125,
        160,
      );
      box("terminal-upper-roof", "dark", site, 0, deck + 215, 30, 146, 5, 166);
      for (const x of [-48, 48]) {
        box("cargo-lift-rib", "metal", site, x, deck + 90, -52, 14, 130, 24);
        box("transfer-intake", "dark", site, x, deck + 120, 30, 45, 22, 161);
      }
      box("terminal-cargo-lift", "metal", site, 0, deck, 80, 42, 350, 46);
      box("terminal-lift-track", "dark", site, 0, deck, 55, 12, 326, 3);
      box("terminal-control", "pale", site, 0, deck + 326, 80, 58, 24, 62);
      box(
        "terminal-control-window",
        "dark",
        site,
        0,
        deck + 333,
        80,
        59,
        10,
        63,
      );
      box("terminal-control-cap", "cargo", site, 0, deck + 350, 80, 64, 7, 68);
    }
  }
  root.userData.foundations = sites;
  finish();
  // Two rooted cargo-hoist portals belong to the continuous waterfront, not
  // the bridge. Quiet haze colours preserve their distant silhouettes without
  // turning the nearby terminal into a pasted-on unfogged tower.
  const hoists = new THREE.Group();
  hoists.name = "night-waterfront-hoists";
  root.add(hoists);
  const haze = new THREE.Color(track.config.fog);
  const colors = Object.fromEntries(
    Object.entries({ pier: 0x9aaeb5, frame: 0x3c7582, cap: 0x9c5372 }).map(
      ([name, color]) => [
        name,
        new THREE.Color(color).lerp(haze, 0.45).getHex(),
      ],
    ),
  );
  const crane = industrialMeshes(hoists, textures, colors, false);
  const quay = sites[2];
  for (const [z, height] of [
    [-500, 500],
    [350, 560],
  ]) {
    for (const x of [-55, 55])
      for (const dz of [-18, 18]) {
        crane.box(
          "hoist-leg",
          "frame",
          quay,
          x,
          quay.deck,
          z + dz,
          14,
          height,
          14,
        );
        crane.box(
          "hoist-pier",
          "pier",
          quay,
          x,
          quay.bottom,
          z + dz,
          24,
          quay.deck - quay.bottom,
          24,
        );
      }
    crane.box(
      "hoist-crosshead",
      "pier",
      quay,
      0,
      quay.deck + height - 12,
      z,
      126,
      20,
      54,
    );
    crane.box(
      "cargo-carriage",
      "cap",
      quay,
      -55,
      quay.deck + height * 0.58,
      z,
      28,
      48,
      50,
    );
    crane.box(
      "hoist-machinery",
      "pier",
      quay,
      0,
      quay.deck + height + 8,
      z,
      38,
      14,
      48,
    );
  }
  crane.finish();
  root.userData.bodies.push(...hoists.userData.bodies);
  return root;
}
