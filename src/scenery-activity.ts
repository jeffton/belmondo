import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { EnvironmentSurface } from "./environment.ts";
import type { Track } from "./track.ts";

type XYZ = [number, number, number];
type Part = [
  position: XYZ,
  size: XYZ,
  color: number,
  roll?: number,
  round?: boolean,
];
type Rig = (time: number) => void;

const ink = 0x29343a;
const ivory = 0xe7dcc1;
const glass = 0x497888;
const steel = 0x829398;
const amber = 0xcf783a;
const red = 0xb94c39;
const tau = Math.PI * 2;

// One authored worksite per lap. Positions are independent of names, road meshes
// and progression; bounds are world-space envelopes for all animated parts.
const sites = {
  coast: {
    kind: "marine-survey",
    u: 0.22,
    side: 1,
    offset: 75,
    radius: 47,
    altitude: 38,
  },
  solar: { kind: "heliostat", u: 0.53, side: 1, offset: 60, radius: 22 },
  noctilucent: {
    kind: "quay-crane",
    u: 0.09,
    side: -1,
    offset: 61,
    radius: 33,
  },
  whiteout: {
    kind: "weather-radar",
    u: 0.659,
    side: -1,
    offset: 47,
    radius: 15,
  },
  monsoon: {
    kind: "intake-screens",
    u: 0.7,
    side: 1,
    offset: 43,
    radius: 19,
  },
  cinderline: {
    kind: "heat-exchanger",
    u: 0.587,
    side: -1,
    offset: 49,
    radius: 20,
  },
  faultline: { kind: "excavator", u: 0.47, side: -1, offset: 64, radius: 31 },
  vesper: {
    kind: "commuter-shuttle",
    u: 0.12,
    side: 1,
    offset: 88,
    radius: 60,
    altitude: 58,
  },
} as const;

type Site = (typeof sites)[keyof typeof sites];

export function scenerySite(
  track: Track,
  surface: Pick<EnvironmentSurface, "terrain" | "heightAt">,
) {
  const key = track.config.layoutId.split("-")[0] as keyof typeof sites;
  const site: Site = sites[key];
  const frame = track.frame(site.u * track.length);
  const right = new THREE.Vector3(
    frame.tangent.z,
    0,
    -frame.tangent.x,
  ).normalize();
  const center = frame.p
    .clone()
    .addScaledVector(right, site.side * (frame.width + site.offset));
  center.y =
    "altitude" in site
      ? frame.p.y + site.altitude
      : surface.heightAt(center.x, center.z);
  const clearance = Math.min(
    ...surface.terrain.samples.map(
      ({ p, width }) =>
        Math.hypot(center.x - p.x, center.z - p.z) - width - site.radius,
    ),
  );
  return {
    ...site,
    center,
    clearance,
    yaw: Math.atan2(frame.tangent.x, frame.tangent.z),
  };
}

/** Low-poly mechanisms, not race entities. Merge each rigid segment so pivots
 * articulate independently without a draw call per strut, window or stripe. */
export function buildSceneryActivity(
  parent: THREE.Object3D,
  track: Track,
  surface: EnvironmentSurface,
) {
  const site = scenerySite(track, surface);
  if (site.clearance < 10)
    throw new Error(
      `Scenery clearance: ${site.kind} ${site.clearance.toFixed(1)} m`,
    );
  const root = new THREE.Group();
  root.name = `scenery-${site.kind}`;
  root.position.copy(site.center);
  root.rotation.y = site.yaw;
  parent.add(root);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const drum = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const tint = new THREE.Color();
  function mesh(parent: THREE.Object3D, parts: Part[]) {
    const geometries = parts.map(([position, size, color, roll = 0, round]) => {
      const g = (round ? drum : box).clone();
      g.scale(...size)
        .rotateZ(roll)
        .translate(...position);
      const count = g.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      tint.setHex(color);
      for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = mergeGeometries(geometries)!;
    geometries.forEach((g) => g.dispose());
    const result = new THREE.Mesh(merged, material);
    parent.add(result);
    return result;
  }
  function pivot(parent: THREE.Object3D, point: XYZ) {
    const joint = new THREE.Group();
    joint.position.set(...point);
    parent.add(joint);
    return joint;
  }
  function pad(width: number, depth: number, color = steel) {
    // A thin service deck on footings rather than a blank wall on steep grades.
    const cos = Math.cos(site.yaw),
      sin = Math.sin(site.yaw);
    const grade = (x: number, z: number) =>
      surface.heightAt(
        site.center.x + x * cos + z * sin,
        site.center.z - x * sin + z * cos,
      ) - site.center.y;
    const high = Math.max(
      ...[-1, 0, 1].flatMap((x) =>
        [-1, 0, 1].map((z) => grade((x * width) / 2, (z * depth) / 2)),
      ),
      0,
    );
    const top = high + 0.8;
    const parts: Part[] = [[[0, top - 0.85, 0], [width, 1.7, depth], color]];
    for (const x of [-0.38 * width, 0.38 * width])
      for (const z of [-0.36 * depth, 0.36 * depth]) {
        const bottom = Math.min(top - 2, grade(x, z) - 1.5);
        parts.push([
          [x, (top + bottom) / 2 - 0.5, z],
          [3.4, top - bottom, 3.4],
          color,
        ]);
      }
    mesh(root, parts);
    return pivot(root, [0, top, 0]);
  }

  function faceApproach(group: THREE.Group) {
    const approach = track.frame(site.u * track.length - 112).p;
    group.rotation.y =
      Math.atan2(approach.x - site.center.x, approach.z - site.center.z) -
      site.yaw;
  }

  let update: Rig;
  switch (site.kind) {
    case "marine-survey": {
      const aircraft = pivot(root, [0, 0, 0]);
      mesh(aircraft, [
        [[0, 0, 0], [5, 4, 23], ivory],
        [[0, 1.8, 7], [4.4, 1.7, 6], glass],
        [[0, -0.7, 1], [8, 2, 12], red],
        [[0, 0.8, -1], [25, 1.2, 5], ivory],
        [[0, 2.9, -8], [1.5, 5.3, 4.5], red],
        [[0, 4.5, -8], [10, 1, 2.8], ivory],
        [[-8, -2, 1], [3.8, 2.5, 11], steel],
        [[8, -2, 1], [3.8, 2.5, 11], steel],
        [[-12.4, 0.7, -0.3], [1.1, 1, 2], red],
        [[12.4, 0.7, -0.3], [1.1, 1, 2], 0x78a893],
      ]).name = "scenery-moving-part";
      update = (t) => {
        const a = t * 0.43;
        aircraft.position.set(
          12 * Math.sin(a),
          3 * Math.sin(a * 2),
          27 * Math.cos(a),
        );
        aircraft.rotation.set(
          0.08 * Math.sin(a * 2),
          Math.atan2(12 * Math.cos(a), -27 * Math.sin(a)),
          -0.36,
        );
      };
      break;
    }
    case "commuter-shuttle": {
      const rail = pivot(root, [0, 0, 0]);
      rail.rotation.y = 0.66;
      const shuttle = pivot(rail, [0, 0, 0]);
      mesh(shuttle, [
        [[0, 0, 0], [8, 4.5, 30], ivory],
        [[0, -2, 0], [7.6, 1.7, 26], 0x705f8b],
        [[0, 0, 14.8], [6.2, 3.4, 5], ivory],
        [[0, 1.2, 15.9], [6.4, 1.6, 3.2], glass],
        [[0, 0.2, 18], [4.8, 1.2, 1.7], ivory],
        [[-5.3, -1.2, -5], [4, 2.4, 15], 0x644b78],
        [[5.3, -1.2, -5], [4, 2.4, 15], 0x644b78],
        ...[-1, 1].flatMap((x): Part[] =>
          [-9, -3, 3, 9].map((z) => [
            [x * 4.1, 0.8, z],
            [0.35, 1.65, 3.8],
            0x73a9b7,
          ]),
        ),
      ]);
      shuttle.children[0].name = "scenery-moving-part";
      // A local skyport holding shuttle banks around the ends, never over the track.
      update = (t) => {
        const a = t * 0.51;
        shuttle.position.set(
          7 * Math.sin(a),
          1.4 * Math.cos(a * 2),
          35 * Math.cos(a),
        );
        shuttle.rotation.set(
          0,
          Math.atan2(7 * Math.cos(a), -35 * Math.sin(a)),
          -0.19,
        );
      };
      break;
    }
    case "heliostat": {
      const yard = pad(22, 21, 0x8c6754);
      mesh(yard, [
        [[0, 1.1, 0], [11, 2.2, 11], ink],
        [[0, 6, 0], [4.5, 11.5, 4.5], ivory, 0, true],
        [[0, 9.3, 0], [5, 2, 5], amber, 0, true],
      ]);
      const azimuth = pivot(yard, [0, 11.6, 0]);
      const table = pivot(azimuth, [0, 2, 0]);
      const parts: Part[] = [
        [[0, -0.8, 0], [25, 1.1, 12], ink],
        [[0, -1.55, 0], [7, 2.2, 10], amber],
        [[0, 0.05, 0], [24, 0.6, 0.6], amber],
      ];
      for (let x = -10; x <= 10; x += 4)
        for (const z of [-3, 3])
          parts.push([
            [x, 0, z],
            [3.68, 0.65, 5.3],
            (x + z) % 3 === 0 ? 0x6da1ae : 0x375e7e,
          ]);
      mesh(table, parts).name = "scenery-moving-part";
      update = (t) => {
        azimuth.rotation.y = 0.45 * Math.sin(t * 0.47);
        table.rotation.x = -0.57 - 0.25 * Math.cos(t * 0.61);
      };
      break;
    }
    case "quay-crane": {
      const quay = pad(25, 23, 0x475162);
      mesh(quay, [
        [[0, 2, 0], [15, 4, 15], ink],
        [[0, 14, 0], [4.2, 24, 4.2], 0x7e667a],
        [[0, 24, 0], [7, 4, 7], ivory],
        [[-6, 2.5, -8], [8, 5, 6], 0x4f7384],
      ]);
      const jib = pivot(quay, [0, 26, 0]);
      mesh(jib, [
        [[7, 1.7, 0], [37, 2.2, 2.8], amber],
        [[-7.5, 0, 0], [9, 4, 5.6], ink],
        [[0, 5.5, 0], [2.2, 10, 3], ivory],
        [[11, 5.5, 0], [24, 0.75, 0.75], steel, -0.27],
        [[2, -0.65, 3.5], [4.5, 4.6, 4.1], red],
        [[3.2, 0.1, 5.7], [2.3, 2, 0.4], glass],
      ]);
      const rope = mesh(jib, [[[0, -0.5, 0], [0.55, 1, 0.55], ink]]);
      const load = pivot(jib, [17, -10, 0]);
      const container: Part[] = [
        [[0, -0.85, 0], [9, 5, 5], 0xab624e],
        [[0, 1.7, 0], [9.2, 0.5, 5.2], ivory],
      ];
      for (let x = -3.5; x < 4; x += 1.75)
        container.push([[x, -0.8, 2.55], [0.3, 4.8, 0.35], amber]);
      mesh(load, container).name = "scenery-moving-part";
      update = (t) => {
        const a = t * 0.55;
        jib.rotation.y = 0.65 + 0.75 * Math.sin(a);
        load.position.set(15 + 4 * Math.sin(a), -11 - 5 * Math.cos(a), 0);
        rope.position.set(load.position.x, 0.8, 0);
        rope.scale.y = rope.position.y - (load.position.y + 1.95);
        load.rotation.y = 0.12 * Math.sin(a * 2);
      };
      break;
    }
    case "weather-radar": {
      const station = pad(18, 17, 0x799396);
      mesh(station, [
        [[0, 1.6, 0], [14, 3.2, 13], 0x385867],
        [[0, 5.6, 0], [5.3, 9, 5.3], ivory, 0, true],
        [[0, 9.8, 0], [6, 1.6, 6], red, 0, true],
        [[6, 2.4, 3], [4.5, 4.8, 5], amber],
      ]);
      const head = pivot(station, [0, 11, 0]);
      const dish = pivot(head, [0, 3.6, 0]);
      const ribs: Part[] = [
        [[0, -2.4, 0], [4.8, 5, 4.2], steel],
        [[0, 0, 0], [5, 8, 1.1], ivory],
        [[0, 0, 4], [0.9, 0.9, 8], ink],
        [[0, 0, 8.3], [2.2, 2.2, 1.4], red],
      ];
      for (const side of [-1, 1]) {
        ribs.push([[side * 4.35, 0, 0.9], [4, 8, 1], ivory]);
        ribs.push([[side * 7, 0, 2.7], [2, 5.5, 1.3], ivory]);
        ribs.push([[side * 6.9, 0.5, 3.8], [2, 1.05, 0.65], amber]);
      }
      mesh(dish, ribs).name = "scenery-moving-part";
      update = (t) => {
        head.rotation.y = t * 0.59;
        dish.rotation.x = -0.28 + 0.15 * Math.sin(t * 0.62);
      };
      break;
    }
    case "intake-screens": {
      const apron = pad(24, 20, 0x74807b);
      faceApproach(apron);
      const housing: Part[] = [
        [[0, 0.9, 0], [24, 1.8, 18], ink],
        [[0, 10.2, -3.5], [22, 1.5, 2.6], ivory],
      ];
      for (const x of [-10, 10]) {
        housing.push([[x, 5.1, -3.5], [2.2, 10.2, 3.8], 0x687d71]);
        housing.push([[x, 1.85, 3], [3.4, 1.6, 9], amber]);
      }
      mesh(apron, housing);
      const screens = [-4.6, 4.6].map((x) => {
        const spindle = pivot(apron, [x, 5.1, 0]);
        const blades: Part[] = [
          [[0, 0, 0], [5.5, 5.5, 8.7], ink],
          [[0, 0, 4.3], [3, 3, 1.5], ivory],
        ];
        for (const a of [0, 1, 2, 3, 4, 5].map((i) => (i * tau) / 6))
          blades.push([
            [3.5 * Math.cos(a), 3.5 * Math.sin(a), 0],
            [2.8, 1.05, 9.2],
            a < 1 || a > 4 ? amber : steel,
          ]);
        mesh(spindle, blades).name = "scenery-moving-part";
        return spindle;
      });
      // Two synchronized rotary intake screens, with contrasting replaceable slats.
      update = (t) => {
        screens[0].rotation.z = t * 1.75;
        screens[1].rotation.z = -t * 1.75 + 0.51;
      };
      break;
    }
    case "heat-exchanger": {
      const apron = pad(24, 22, 0x5b484c);
      faceApproach(apron);
      const fixed: Part[] = [
        [[0, 1.6, 0], [22, 3.2, 20], ink],
        [[0, 8, -6], [20, 13, 4], 0x8c5b4f],
        [[0, 13.8, -3], [14, 2, 6], steel],
      ];
      for (const x of [-8, 8]) {
        fixed.push([[x, 8.8, 3], [3.5, 14, 3.5], amber]);
        fixed.push([[x, 14.4, 3], [4.4, 1.3, 4.4], ivory]);
      }
      mesh(apron, fixed);
      const flywheel = pivot(apron, [0, 9.4, 3]);
      const parts: Part[] = [
        [[0, 0, 0], [10.6, 10.6, 2.8], ink],
        [[0, 0, 1.7], [2.8, 2.8, 1.8], ivory],
      ];
      for (let i = 0; i < 8; i++) {
        const a = (i * tau) / 8;
        parts.push([
          [3.2 * Math.cos(a), 3.2 * Math.sin(a), 1.55],
          [4.6, 1.35, 0.9],
          i % 2 ? amber : red,
          a + 0.16,
        ]);
      }
      mesh(flywheel, parts).name = "scenery-moving-part";
      const ram = mesh(apron, [[[0, 0, 0], [2.7, 6, 2.7], ivory]]);
      update = (t) => {
        flywheel.rotation.z = t * 1.7;
        ram.position.set(8, 8.3 + 2.1 * Math.sin(t * 1.7), 4);
      };
      break;
    }
    case "excavator": {
      const bench = pad(27, 26, 0x706654);
      const base: Part[] = [[[0, 2.8, 0], [10, 5.6, 13.5], ink]];
      for (const x of [-5.4, 5.4]) {
        base.push([[x, 1.6, 0], [3.5, 3.2, 16], ink]);
        for (const z of [-6, -3, 0, 3, 6])
          base.push([[x, 0.7, z], [3.75, 1.25, 1.2], steel]);
      }
      mesh(bench, base);
      const cab = pivot(bench, [0, 5.6, 0]);
      mesh(cab, [
        [[0, 1.9, -1], [11.5, 4.2, 9], amber],
        [[-2.6, 5.1, 0.9], [4.8, 5.1, 5.3], ivory],
        [[-2.6, 5.6, 3.65], [3.7, 2.75, 0.45], glass],
        [[-5.15, 5.6, 0.9], [0.4, 2.75, 3.7], glass],
        [[3.9, 1.1, -5.8], [2, 1.2, 0.55], ivory],
        [[-3.9, 1.1, -5.8], [2, 1.2, 0.55], ivory],
      ]);
      const boom = pivot(cab, [2.6, 2.4, 3]);
      mesh(boom, [
        [[0, 0, 5.8], [2, 3.1, 12.5], amber],
        [[1.4, -1.9, 4.75], [1, 1.1, 7.3], steel],
      ]);
      const stick = pivot(boom, [0, 0, 11.8]);
      mesh(stick, [
        [[0, 0, 4.2], [1.6, 2.1, 8.8], amber],
        [[1.1, 1.2, 3.5], [0.85, 0.85, 6.1], steel],
      ]);
      const bucket = pivot(stick, [0, 0, 8.5]);
      mesh(bucket, [
        [[0, -0.7, 0.8], [5.3, 3, 3.5], 0x586364],
        [[0, -2.15, 1.6], [5.3, 0.9, 5], ink],
        ...[-2, 0, 2].map((x): Part => [
          [x, -2.26, 4.15],
          [0.72, 0.7, 1.75],
          steel,
        ]),
      ]);
      bucket.children[0].name = "scenery-moving-part";
      update = (t) => {
        const dig = (Math.cos(t * 0.72) + 1) / 2;
        const lift = dig * dig * (3 - 2 * dig);
        cab.rotation.y = 1.3 - lift * 1.25;
        boom.rotation.x = -0.28 - 0.69 * lift;
        stick.rotation.x = 0.67 + 0.44 * lift;
        bucket.rotation.x = -0.2 + 0.84 * lift;
      };
      break;
    }
  }
  box.dispose();
  drum.dispose();
  update(0);
  return { root, update };
}
