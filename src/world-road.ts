import * as THREE from "three";
import type { Track, TrackFrame, RoadBounds } from "./track.ts";
import type { CircuitTextures } from "./environment.ts";
import type { buildTrackLighting } from "./track-lighting.ts";
import { clamp } from "./track.ts";
import { roadFrame, roadPoint, roadStrip } from "./road-cross-section.ts";
import { RAIL_PROFILE } from "./rail-profile.ts";
import { railPoint, railBackDepth, railHeight } from "./rail-geometry.ts";
import { railFaceUV } from "./rail-face.ts";
import { tunnelSegment } from "./tunnel-architecture.ts";
import { applyJumpMarkings } from "./jump-markings.ts";
import { createRoadFinish } from "./road-finish.ts";
import { applyForkCues, forkCueDistance, forkCueLayout } from "./fork-cues.ts";

type RoadFrame = TrackFrame & RoadBounds & { branch?: number };
interface SurfaceQuad {
  p: THREE.Vector3[];
  color: THREE.ColorRepresentation;
  kind?: string;
  uv?: number[][];
  indices?: number[];
  forkDistance?: number[];
}
export function quadGeometry(
  quads: SurfaceQuad[],
  lighting: ReturnType<typeof buildTrackLighting>,
) {
  const vertices = [],
    c = [],
    uv: number[] = [],
    forkDistance: number[] = [];
  for (const q of quads) {
    const cornerColors = q.p.map(
      (point) => new THREE.Color(lighting.shade(point, q.color)),
    );
    for (const i of q.indices ?? [0, 2, 1, 0, 3, 2]) {
      const color = cornerColors[i];
      vertices.push(...q.p[i].toArray());
      c.push(color.r, color.g, color.b);
      if (q.forkDistance) forkDistance.push(q.forkDistance[i]);
      uv.push(
        ...(q.uv || [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ])[i],
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (forkDistance.length)
    g.setAttribute(
      "forkCueDistance",
      new THREE.Float32BufferAttribute(forkDistance, 1),
    );
  g.computeVertexNormals();
  return g;
}

export type CourseLighting = ReturnType<typeof buildTrackLighting>;

export function* buildRoadMesh(
  scene: THREE.Scene,
  track: Track,
  stations: number[],
  textures: CircuitTextures & { rail?: THREE.Texture },
  lighting: CourseLighting,
  sliceStart: number,
) {
  const cfg = track.config;
  const faultline = cfg.name === "FAULTLINE";
  const quads: SurfaceQuad[] = [];
  const forkCue = forkCueLayout(track, stations);
  const addStrip = (
    a: RoadFrame,
    b: RoadFrame,
    left: number,
    right: number,
    y: number,
    color: THREE.ColorRepresentation,
    kind = "paint",
  ) => {
    const edgeAt = (frame: RoadFrame, value: number) =>
      Math.abs(value) > a.width - 0.6
        ? value + Math.sign(value) * (frame.width - a.width)
        : value;
    const leftA = clamp(left, a.clipMin, a.clipMax),
      rightA = clamp(right, a.clipMin, a.clipMax);
    const leftB = clamp(edgeAt(b, left), b.clipMin, b.clipMax),
      rightB = clamp(edgeAt(b, right), b.clipMin, b.clipMax);
    if (leftA === rightA && leftB === rightB) return;
    // Night projectors need vertices across the deck, not just at its edges.
    // Boundaries and root stations are unchanged; subdivision is render-only.
    const divisions = kind === "road" && cfg.name === "NOCTILUCENT" ? 8 : 1;
    for (let strip = 0; strip < divisions; strip++) {
      const x0 =
        strip === 0
          ? leftA
          : THREE.MathUtils.lerp(leftA, rightA, strip / divisions);
      const x1 =
        strip + 1 === divisions
          ? rightA
          : THREE.MathUtils.lerp(leftA, rightA, (strip + 1) / divisions);
      const x2 =
        strip + 1 === divisions
          ? rightB
          : THREE.MathUtils.lerp(leftB, rightB, (strip + 1) / divisions);
      const x3 =
        strip === 0
          ? leftB
          : THREE.MathUtils.lerp(leftB, rightB, strip / divisions);
      const stripGeometry = roadStrip(
        track,
        a,
        b,
        [x0, x1, x2, x3],
        y,
        [strip / divisions, (strip + 1) / divisions],
        (kind === "road" || kind === "concrete") &&
          left === -a.width &&
          right === a.width,
      );
      quads.push({
        ...stripGeometry,
        color,
        kind,
        forkDistance:
          forkCue && kind === "road"
            ? stripGeometry.p.map((point, i) =>
                forkCueDistance(stripGeometry.ends[i] ? b : a, point),
              )
            : undefined,
      });
    }
  };
  for (let i = 0; i < stations.length - 1; i++) {
    const u = stations[i];
    const split = u >= cfg.split[0] && u < cfg.split[1];
    if (performance.now() - sliceStart >= 1000 / 60) {
      yield;
      sliceStart = performance.now();
    }
    if (track.gap(u)) continue;
    for (const branch of split ? [-1, 1] : [0]) {
      const a = roadFrame(track, u * track.length, branch),
        b = roadFrame(
          track,
          stations[i + 1] * track.length -
            (stations[i + 1] === cfg.jump ? 0.000001 : 0),
          branch,
        ),
        w = a.width;
      const shared = split && a.connected && b.connected;
      addStrip(
        a,
        b,
        -w,
        w,
        0,
        cfg.biome === "metropolis"
          ? i % 9 < 2
            ? 0x526578
            : 0x46586c
          : i % 9 < 2
            ? 0xb6bdc4
            : 0xc1c3c3,
        "road",
      );
      addStrip(a, b, -w, w, -2, 0x7a8589, "concrete");
      // Recessed service shoulders, not car-racing curbs or painted lanes.
      // Chevrons belong exclusively to real boost pads.
      if (!shared || a.innerSide === 1)
        addStrip(a, b, -w, -w + 1.65, 0.025, 0x697176, "edge");
      if (!shared || a.innerSide === -1)
        addStrip(a, b, w - 1.65, w, 0.025, 0x697176, "edge");
      for (const side of [-1, 1]) {
        if (shared && side === a.innerSide) continue;
        addRailPanel(quads, track, a, b, side, u, i, split, branch);
      }
      if (track.isTunnel(u * track.length, branch))
        quads.push(...tunnelSegment(a, b, track));
    }
  }
  // The open quarry sees multiple stacked road sectors at once. Larger
  // render-only cells reduce submissions without merging the whole circuit.
  const roadChunkSize = faultline ? 512 : 256;
  for (const kind of [
    "road",
    "concrete",
    "paint",
    "edge",
    "rail",
    "light",
    "tunnel",
  ] as const) {
    const material =
      kind === "road"
        ? createRoadFinish(cfg.name, textures.road)
        : kind === "light"
          ? new THREE.MeshBasicMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
            })
          : new THREE.MeshLambertMaterial({
              vertexColors: true,
              map: textures[kind === "tunnel" ? "concrete" : kind],
              // Baked service-light bounce keeps the soffit readable without
              // adding per-bay real-time lights or lifting the outside world.
              emissive: kind === "tunnel" ? 0x202632 : 0x000000,
              side: THREE.DoubleSide,
              flatShading: true,
            });
    if (kind === "road") {
      applyJumpMarkings(material, track);
      if (forkCue) applyForkCues(material, forkCue);
    }
    const chunks = new Map<string, SurfaceQuad[]>();
    for (const q of quads.filter((q) => q.kind === kind)) {
      const key = `${Math.floor(q.p[0].x / roadChunkSize)}:${Math.floor(q.p[0].z / roadChunkSize)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key)!.push(q);
    }
    for (const chunk of chunks.values()) {
      scene.add(new THREE.Mesh(quadGeometry(chunk, lighting), material));
      if (performance.now() - sliceStart >= 1000 / 60) {
        yield;
        sliceStart = performance.now();
      }
    }
  }
  return sliceStart;
}

function addRailPanel(
  quads: SurfaceQuad[],
  track: Track,
  a: RoadFrame,
  b: RoadFrame,
  side: number,
  u: number,
  i: number,
  split: boolean,
  branch: number,
) {
  const cfg = track.config;
  const edgeA = clamp(a.width * side, a.clipMin, a.clipMax),
    edgeB = clamp(b.width * side, b.clipMin, b.clipMax);
  const lowerA = roadPoint(a, edgeA, -2);
  const lowerB = roadPoint(b, edgeB, -2);
  const nose = split && side === a.innerSide && u < cfg.split[0] + 0.07;
  quads.push({
    p: [lowerA, lowerB, roadPoint(b, edgeB, 0), roadPoint(a, edgeA, 0)],
    color: 0xbac0b0,
    kind: "concrete",
  });
  // The physical face slopes outwards; split tips taper from zero height
  // and meet at the median rather than overlapping the opposite lane.
  const H = RAIL_PROFILE.height;
  const backA = railBackDepth(track, a, side),
    backB = railBackDepth(track, b, side);
  const back = (f: RoadFrame) => (f === a ? backA : backB);
  const wallPoint = (
    frame: RoadFrame,
    edge: number,
    height: number,
    depth: number | ((frame: RoadFrame) => number) = 0,
  ) =>
    railPoint(
      frame,
      edge,
      side,
      height,
      typeof depth === "function" ? depth(frame) : depth,
    );
  const face = (
    low: number,
    high: number,
    color: THREE.ColorRepresentation,
    depth: number | ((frame: RoadFrame) => number) = 0,
    kind = "edge",
  ) => {
    quads.push({
      p: [
        wallPoint(a, edgeA, low, depth),
        wallPoint(b, edgeB, low, depth),
        wallPoint(b, edgeB, high, depth),
        wallPoint(a, edgeA, high, depth),
      ],
      color,
      kind,
      uv:
        kind === "rail"
          ? [
              railFaceUV(a.u, Math.min(low, railHeight(a, side)), track.length),
              railFaceUV(
                b.u < a.u ? b.u + 1 : b.u,
                Math.min(low, railHeight(b, side)),
                track.length,
              ),
              railFaceUV(
                b.u < a.u ? b.u + 1 : b.u,
                Math.min(high, railHeight(b, side)),
                track.length,
              ),
              railFaceUV(
                a.u,
                Math.min(high, railHeight(a, side)),
                track.length,
              ),
            ]
          : [
              [(a.u * track.length) / 8, low / 3],
              [(b.u * track.length) / 8, low / 3],
              [(b.u * track.length) / 8, high / 3],
              [(a.u * track.length) / 8, high / 3],
            ],
    });
  };
  const joint = i % 3 === 0;
  // Mineral-paint light/dark panels cover the physical slope itself;
  // there is no added banner, curb or luminous strip.
  face(0, 0.38, 0xffffff, 0, "rail");
  face(0.38, H - 0.25, 0xffffff, 0, "rail");
  face(H - 0.25, H, 0xffffff, 0, "rail");
  face(0, H, 0x737e84, back);
  quads.push({
    p: [
      wallPoint(a, edgeA, H),
      wallPoint(b, edgeB, H),
      wallPoint(b, edgeB, H, backB),
      wallPoint(a, edgeA, H, backA),
    ],
    color: 0xffffff,
    kind: "rail",
    uv: [
      railFaceUV(a.u, railHeight(a, side), track.length),
      railFaceUV(b.u < a.u ? b.u + 1 : b.u, railHeight(b, side), track.length),
      railFaceUV(b.u < a.u ? b.u + 1 : b.u, railHeight(b, side), track.length),
      railFaceUV(a.u, railHeight(a, side), track.length),
    ],
  });
  // Substantial cast impact blocks project OUT of the physical boundary.
  // The continuous inner face/height remains exactly the collision wall.
  if (joint && (branch === 0 || side !== a.innerSide)) {
    face(-2, H, 0x7e8a91, 2.6);
    quads.push({
      p: [
        wallPoint(a, edgeA, H, backA),
        wallPoint(b, edgeB, H, backB),
        wallPoint(b, edgeB, H, 2.6),
        wallPoint(a, edgeA, H, 2.6),
      ],
      color: 0xaeb1a8,
      kind: "edge",
    });
    for (const [f, edge] of [
      [a, edgeA],
      [b, edgeB],
    ] as [RoadFrame, number][])
      quads.push({
        p: [
          wallPoint(f, edge, -2, back(f)),
          wallPoint(f, edge, H, back(f)),
          wallPoint(f, edge, H, 2.6),
          wallPoint(f, edge, -2, 2.6),
        ],
        color: 0x68757e,
        kind: "edge",
      });
  }
  if (i % 8 === 0)
    face(0.65, 0.82, nose ? 0xffa348 : 0xc3c6a0, -0.018, "light");
}
