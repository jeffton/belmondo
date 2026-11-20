import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { railPoint } from "./rail-geometry.ts";
import { RAIL_PROFILE } from "./rail-profile.ts";
import { roadFrame, roadPoint } from "./road-surface.ts";
import type { Track } from "./track.ts";

interface Mount {
  district: string;
  at: number;
  branch: number;
  side: -1 | 1;
  kind: "derrick" | "swan" | "bulkhead" | "outrigger";
  height: number;
  reach: number;
  color: number;
  // Each optical head has its own longitudinal aim, lateral aim, beam width,
  // beam length and haze. Distances are world units, not a repeated pole pitch.
  optics: readonly (readonly [number, number, number, number, number])[];
}

const mounts: readonly Mount[] = [
  {
    district: "terminal-apron",
    at: 0.991,
    branch: 0,
    side: -1,
    kind: "derrick",
    height: 22,
    reach: 2.4,
    color: 0xffcb88,
    optics: [
      [32, 0.34, 13, 44, 0.13],
      [-25, -0.36, 10, 34, 0.09],
    ],
  },
  {
    district: "terminal-service",
    at: 0.022,
    branch: 0,
    side: 1,
    kind: "bulkhead",
    height: 2.8,
    reach: 0.6,
    color: 0xffc191,
    optics: [[10, 0.48, 6, 23, 0]],
  },
  {
    district: "freight-grade",
    at: 0.119,
    branch: 0,
    side: 1,
    kind: "swan",
    height: 15,
    reach: 5.1,
    color: 0xbcdcff,
    optics: [[29, -0.2, 17, 46, 0.12]],
  },
  {
    district: "dock-turn",
    at: 0.238,
    branch: 0,
    side: -1,
    kind: "derrick",
    height: 25,
    reach: 2.1,
    color: 0xffd5a0,
    optics: [
      [23, 0.15, 17, 43, 0.12],
      [-29, -0.42, 9, 31, 0.075],
    ],
  },
  {
    district: "bore-mouth",
    at: 0.335,
    branch: -1,
    side: -1,
    kind: "bulkhead",
    height: 4.1,
    reach: 0.3,
    color: 0xffba83,
    optics: [[-8, -0.39, 8, 15, 0]],
  },
  {
    district: "outer-terrace",
    at: 0.384,
    branch: 1,
    side: 1,
    kind: "swan",
    height: 10,
    reach: 3.4,
    color: 0xdde6de,
    optics: [[19, -0.25, 13, 31, 0.07]],
  },
  {
    district: "runway-threshold",
    at: 0.467,
    branch: 0,
    side: 1,
    kind: "bulkhead",
    height: 2.1,
    reach: 0.55,
    color: 0xa7d9ff,
    optics: [[-11, 0.35, 9, 17, 0]],
  },
  {
    district: "landing-range",
    at: 0.516,
    branch: 0,
    side: -1,
    kind: "swan",
    height: 13,
    reach: 5.9,
    color: 0xacddff,
    optics: [[-21, 0.32, 18, 52, 0.13]],
  },
  {
    district: "switchback-lookout",
    at: 0.604,
    branch: 0,
    side: 1,
    kind: "swan",
    height: 16,
    reach: 4.6,
    color: 0xd3dffa,
    optics: [[20, -0.38, 14, 38, 0.1]],
  },
  {
    district: "viaduct-a",
    at: 0.724,
    branch: 0,
    side: 1,
    kind: "outrigger",
    height: 8.2,
    reach: 1.7,
    color: 0xffc99b,
    optics: [[16, 0.26, 11, 32, 0.11]],
  },
  {
    district: "viaduct-b",
    at: 0.759,
    branch: 0,
    side: -1,
    kind: "outrigger",
    height: 6.8,
    reach: 1.4,
    color: 0xffc99b,
    optics: [[-12, -0.12, 12, 33, 0.095]],
  },
  {
    district: "downhill-service",
    at: 0.858,
    branch: 0,
    side: -1,
    kind: "bulkhead",
    height: 3.2,
    reach: 0.4,
    color: 0xffc98f,
    optics: [[13, -0.27, 8, 24, 0]],
  },
  {
    district: "terminal-return",
    at: 0.948,
    branch: 0,
    side: 1,
    kind: "swan",
    height: 12,
    reach: 3.8,
    color: 0xe4e5d3,
    optics: [[19, -0.16, 15, 37, 0.095]],
  },
];

export function noctilucentLightingPlan(track: Track) {
  if (track.config.name !== "NOCTILUCENT") return [];
  return mounts.map((mount) => {
    const station = mount.at * track.length;
    const frame = roadFrame(track, station, mount.branch);
    const edge = mount.side < 0 ? frame.clipMin : frame.clipMax;
    const base = railPoint(frame, edge, mount.side, RAIL_PROFILE.height, 0.48);
    const color = new THREE.Color(mount.color);
    const inward = frame.right.clone().multiplyScalar(-mount.side);
    const local = (x: number, y: number, z: number) =>
      base
        .clone()
        .addScaledVector(inward, x)
        .addScaledVector(frame.up, y)
        .addScaledVector(frame.tangent, z);
    const heads = mount.optics.map(([aim, cross, width, length, haze], i) => {
      const center = station + aim;
      const target = roadFrame(track, center, mount.branch);
      const aimPoint = roadPoint(target, cross * target.width, 0);
      const socket = local(
        mount.reach,
        mount.height,
        mount.optics.length === 1 ? 0 : i === 0 ? 2.65 : -2.65,
      );
      const axis = aimPoint.clone().sub(socket).normalize();
      const apex = socket.clone().addScaledVector(axis, 1.12);
      function deck(x: number, y: number) {
        const f = roadFrame(track, center + y * length, mount.branch);
        const lateral = THREE.MathUtils.clamp(
          cross * f.width + x * width,
          f.clipMin + 0.18,
          f.clipMax - 0.18,
        );
        return roadPoint(f, lateral, 0.075);
      }
      return {
        center,
        width,
        length,
        haze,
        target,
        aimPoint,
        socket,
        axis,
        apex,
        deck,
      };
    });
    return { ...mount, station, frame, base, local, heads, tint: color };
  });
}

export function buildNoctilucentLighting(scene: THREE.Object3D, track: Track) {
  const mounts = noctilucentLightingPlan(track);
  if (!mounts.length) return null;
  const hardware = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const light = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
  });
  const emit = new THREE.MeshBasicMaterial({ vertexColors: true });
  const root = new THREE.Group();
  root.name = "noctilucent-industrial-lighting";
  scene.add(root);

  for (const {
    district,
    kind,
    base,
    local,
    reach,
    height,
    frame,
    heads,
    tint,
  } of mounts) {
    const solids: THREE.BufferGeometry[] = [];
    const lenses: THREE.BufferGeometry[] = [];
    const support = new THREE.Color(
      kind === "derrick"
        ? 0x82554b
        : kind === "outrigger"
          ? 0x8f5852
          : 0x748391,
    );
    const housing = new THREE.Color(0x3c4651);
    function piece(
      geometry: THREE.BufferGeometry,
      position: THREE.Vector3,
      rotation: THREE.Quaternion,
      color: THREE.Color,
      batch = solids,
    ) {
      geometry
        .applyQuaternion(rotation)
        .translate(position.x, position.y, position.z);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      batch.push(geometry);
    }
    const up = new THREE.Vector3(0, 1, 0);
    function strut(
      a: THREE.Vector3,
      b: THREE.Vector3,
      width: number,
      tapered = false,
    ) {
      const axis = b.clone().sub(a);
      const length = axis.length();
      piece(
        tapered
          ? new THREE.CylinderGeometry(width * 0.28, width * 0.5, length, 8)
          : new THREE.BoxGeometry(width, length, width),
        a.clone().lerp(b, 0.5),
        new THREE.Quaternion().setFromUnitVectors(up, axis.normalize()),
        support,
      );
    }
    strut(local(0, -0.78, 0), local(0, 0.22, 0), 1.9);
    if (kind === "derrick") {
      for (const end of [-2.65, 2.65]) {
        strut(local(0, 0, end * 0.25), local(-0.5, height - 1.1, end), 0.66);
        strut(local(-0.5, height - 1.1, end), local(reach, height, end), 0.64);
      }
      for (const [low, high] of [
        [1.5, 6.5],
        [6.5, 13],
        [13, height - 1.1],
      ]) {
        const z = (y: number) =>
          THREE.MathUtils.lerp(0.66, 2.65, y / (height - 1.1));
        strut(local(0, low, -z(low)), local(-0.5, high, z(high)), 0.32);
        strut(local(0, low, z(low)), local(-0.5, high, -z(high)), 0.32);
      }
    } else if (kind === "swan") {
      const knee = local(0, height - 4.0, 0);
      const elbow = local(reach * 0.43, height - 0.6, 0);
      strut(base, knee, 1.22, true);
      strut(knee, elbow, 0.66, true);
      strut(elbow, local(reach, height, 0), 0.55, true);
    } else {
      strut(base, local(0, height, 0), kind === "outrigger" ? 0.73 : 1.1);
      strut(local(0, height - 0.35, 0), local(reach, height, 0), 0.64);
      if (kind === "outrigger")
        strut(local(0, height - 3.7, 0), local(reach, height, 0), 0.48);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const vertex = (p: THREE.Vector3, alpha: number) => {
      const index = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      colors.push(tint.r, tint.g, tint.b, alpha);
      return index;
    };
    const sectors = 16;
    function band(a: number[], b: number[]) {
      for (let i = 0; i < sectors; i++) {
        const next = (i + 1) % sectors;
        indices.push(a[i], b[i], b[next]);
        if (a[i] !== a[next]) indices.push(a[i], b[next], a[next]);
      }
    }
    for (const head of heads) {
      const rotation = new THREE.Matrix4().lookAt(
        head.aimPoint,
        head.socket,
        frame.up,
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(rotation);
      const round = kind === "swan";
      const w = kind === "derrick" ? 4.35 : kind === "outrigger" ? 3.0 : 2.55;
      const h = kind === "bulkhead" ? 1.13 : kind === "outrigger" ? 0.87 : 1.48;
      const along = (distance: number) =>
        head.socket.clone().addScaledVector(head.axis, distance);
      if (round) {
        const cylinder = new THREE.CylinderGeometry(1.42, 0.97, 1.88, 10)
          .rotateX(Math.PI / 2)
          .scale(1, 0.69, 1);
        piece(cylinder, head.socket, q, housing);
        piece(
          new THREE.CircleGeometry(1.28, 10).scale(1, 0.68, 1),
          along(0.95),
          q,
          tint,
          lenses,
        );
      } else {
        piece(new THREE.BoxGeometry(w, h, 1.92), head.socket, q, housing);
        for (const x of [-1, 1]) {
          const lens = along(0.975).add(
            new THREE.Vector3(x * w * 0.21, 0, 0).applyQuaternion(q),
          );
          piece(
            new THREE.PlaneGeometry(w * 0.38, h * 0.67),
            lens,
            q,
            tint,
            lenses,
          );
        }
        const hood = along(0.5).add(
          new THREE.Vector3(0, h * 0.49, 0).applyQuaternion(q),
        );
        piece(new THREE.BoxGeometry(w * 1.04, 0.22, 2.65), hood, q, housing);
      }
      // Use the same surveyed deck patch for the pool and shaft; no independent
      // vertical cones, floating quads or light projected into the jump gap.
      const ring = (radius: number) =>
        Array.from({ length: sectors }, (_, sector) => {
          const angle = (sector * Math.PI * 2) / sectors;
          return head.deck(radius * Math.cos(angle), radius * Math.sin(angle));
        });
      const center = vertex(head.deck(0, 0), 0.29);
      let previous = Array<number>(sectors).fill(center);
      for (const radius of [0.25, 0.5, 0.75, 1]) {
        const next = ring(radius).map((p) =>
          vertex(p, (1 - radius * radius) ** 2 * 0.29),
        );
        band(previous, next);
        previous = next;
      }
      if (head.haze) {
        const rim = ring(0.85);
        const start = vertex(head.apex, 0);
        previous = Array<number>(sectors).fill(start);
        for (const [position, opacity] of [
          [0.2, 0.42],
          [0.62, 0.32],
          [1, 0],
        ]) {
          const next = rim.map((p) =>
            vertex(head.apex.clone().lerp(p, position), opacity * head.haze),
          );
          band(previous, next);
          previous = next;
        }
      }
    }
    const batch = (
      geometries: THREE.BufferGeometry[],
      material: THREE.Material,
    ) => {
      const geometry = mergeGeometries(geometries);
      for (const part of geometries) part.dispose();
      return new THREE.Mesh(geometry, material);
    };
    const atmosphere = new THREE.BufferGeometry();
    atmosphere.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    atmosphere.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 4),
    );
    atmosphere.setIndex(indices);
    const fixture = new THREE.Group();
    fixture.name = district;
    fixture.add(
      batch(solids, hardware),
      batch(lenses, emit),
      new THREE.Mesh(atmosphere, light),
    );
    root.add(fixture);
  }

  const pools = mounts.flatMap((mount) =>
    mount.heads.map((head) => ({
      ...head,
      tint: mount.tint,
      rangeSquared: Math.max(head.width, head.length) ** 2,
    })),
  );
  const delta = new THREE.Vector3();
  const lit = new THREE.Color();
  return (point: THREE.Vector3, color: THREE.Color, sectional: number) => {
    let strength = 0;
    for (const pool of pools) {
      delta.subVectors(point, pool.aimPoint);
      if (delta.lengthSq() >= pool.rangeSquared) continue;
      const radius =
        (delta.dot(pool.target.right) / pool.width) ** 2 +
        (delta.dot(pool.target.tangent) / pool.length) ** 2 +
        (delta.dot(pool.target.up) / 8) ** 2;
      const gain = Math.max(0, 1 - radius) ** 2;
      if (gain > strength) {
        strength = gain;
        lit.copy(pool.tint);
      }
    }
    return color
      .multiplyScalar(sectional * 0.7)
      .lerp(lit, strength * 0.19)
      .getHex();
  };
}
