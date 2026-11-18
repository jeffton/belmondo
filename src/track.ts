import * as THREE from "three";
import { RAIL_PROFILE } from "./rail-profile.ts";
import { NEW_COURSES } from "./course-layouts.ts";
import { FAULTLINE_COURSE } from "./faultline-course.ts";

export type StationRange = [number, number];
export interface TrackCrossing {
  upperU: number;
  lowerU: number;
  clearance: number;
  point: number[];
  upperSpan: StationRange;
}
export interface TrackSections {
  finishStraight: StationRange;
  runway?: StationRange | null;
  crossings?: TrackCrossing[];
  upperBridge?: StationRange;
  descent?: StationRange;
  mountainTunnel?: StationRange;
  hillOverpass?: StationRange;
  dryLock?: StationRange;
  spillwayDive?: StationRange;
  pressureConduit?: StationRange;
  reservoirWalkway?: StationRange;
  headlandBore?: StationRange;
  [name: string]: StationRange | TrackCrossing[] | null | undefined;
}
export interface TrackConfig {
  name: string;
  subtitle: string;
  layoutId: string;
  curveType: THREE.CurveType;
  points: number[][];
  color: number;
  sky: number;
  fog: number;
  sea: number;
  lighting?: string;
  biome?: string;
  night?: boolean;
  width: number;
  branchWidths: number[];
  split: StationRange;
  jump: number | null;
  gapLength: number | null;
  ramp?: {
    start: number;
    height: number;
    length: number;
    profile?: "arc";
  } | null;
  tunnel: StationRange | null;
  tunnelBranches?: number[];
  banks?: number[][];
  sections: TrackSections;
  rhythm?: { start: number; end: number; offset: number }[];
  returnRoute?: {
    start: number;
    end: number;
    radii: number[];
    knots: number[][];
  };
  runwayEntryFade?: number;
  runwayExitFade?: number;
  // World-space distance to the outgoing Bezier control point of the exit sweep.
  runwayExitHandle?: number;
  widthSections?: {
    start: number;
    fullStart: number;
    fullEnd: number;
    end: number;
    width: number;
  }[];
  fork?: {
    offsets: number[];
    rise: number[];
    labels?: string[];
    crossing?: boolean;
    riseProfile?: number[];
    bends?: { branch: number; start: number; end: number; offset: number }[];
    authored?: { start: number; end: number; knots: number[][][] };
  };
}
export type CourseConfig = TrackConfig;
export interface TrackFrame {
  p: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bank: number;
  u: number;
  width: number;
  metric: number;
}
export interface RoadBounds {
  clipMin: number;
  clipMax: number;
  wallMin: number;
  wallMax: number;
  connected: boolean;
  seam: THREE.Vector3 | null;
  innerSide: number;
  railMinHeight: number;
  railMaxHeight: number;
}
export interface Track {
  config: TrackConfig;
  length: number;
  finishS: number;
  physicalLengths: Record<string, number>;
  physicalLength: number;
  frame(s: number, branch?: number): TrackFrame;
  gap(u: number): boolean;
  curvature(s: number, branch?: number): number;
  isTunnel(s: number, branch?: number): boolean;
  bounds(s: number, branch?: number): RoadBounds;
}
interface RouteFrame {
  p: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  metric: number;
  bank?: number;
}

// The old three circuits have individually authored plan/elevation profiles.
// Long approaches expose the tightening counterturns before their apexes;
// the final runway/home-straight shaping remains shared with the other courses.
function layoutPoints(course: "coast" | "solar" | "night") {
  return {
    coast: [
      [0, 90, 0],
      [0, 100, 450],
      [-180, 160, 850],
      [80, 230, 1100],
      [-60, 290, 1370],
      [-430, 260, 1500],
      [-800, 160, 1420],
      [-1000, 90, 1120],
      [-1150, 70, 760],
      [-1550, 180, 700],
      [-1750, 260, 1000],
      [-2000, 310, 1300],
      [-2400, 240, 1300],
      [-2530, 210, 1241.42],
      [-2600.71, 190, 1170.71],
      [-2622.39, 180, 1138.27],
      [-2630, 170, 1100],
      [-2622.39, 160, 1061.73],
      [-2600.71, 150, 1029.29],
      [-2530, 130, 958.58],
      [-2459.29, 115, 887.87],
      [-2388.58, 105, 817.16],
      [-2180, 100, 580],
      [-2090, 190, 250],
      [-2350, 310, -50],
      [-2540, 360, -370],
      [-2440, 300, -730],
      [-2110, 210, -900],
      [-1920, 160, -1200],
      [-1550, 115, -1450],
      [-1100, 80, -1500],
      [-650, 90, -1420],
      [-220, 90, -1150],
      [0, 90, -700],
      [0, 90, -350],
    ],
    solar: [
      [0, 130, 0],
      [0, 160, 450],
      [-280, 240, 800],
      [-650, 350, 780],
      [-800, 420, 1100],
      [-1150, 450, 1320],
      [-1530, 350, 1200],
      [-1700, 260, 850],
      [-2050, 200, 650],
      [-2450, 250, 700],
      [-2800, 350, 900],
      [-3150, 400, 800],
      [-3300, 330, 430],
      [-3060, 240, 100],
      [-2750, 160, -100],
      [-2700, 100, -420],
      [-2420, 150, -850],
      [-1950, 220, -1100],
      [-1500, 280, -1220],
      [-1000, 300, -1150],
      [-600, 220, -900],
      [-350, 140, -550],
      [0, 180, -650],
      [300, 260, -950],
      [650, 300, -800],
      [740, 230, -450],
      [450, 150, -180],
      [0, 130, -350],
    ],
    night: [
      [550, 65, 0],
      [470, 95, -400],
      [180, 180, -720],
      [-220, 280, -800],
      [-470, 340, -620],
      [-480, 310, -340],
      [-650, 230, -160],
      [-936, 90, 0],
      [-1200, 90, 350],
      [-1500, 140, 700],
      [-1900, 230, 900],
      [-2250, 320, 850],
      [-2490, 390, 550],
      [-2530, 420, 100],
      [-2320, 370, -260],
      [-2500, 280, -600],
      [-2370, 200, -950],
      [-2000, 150, -1100],
      [-1640, 180, -850],
      [-1300, 250, -450],
      [-936, 350, 0],
      [-550, 400, 450],
      [-180, 450, 780],
      [180, 430, 900],
      [550, 350, 850],
      [820, 270, 550],
      [650, 220, 150],
    ],
  }[course];
}

export const TRACK_INDEX = Object.freeze({
  WHITEOUT: 0,
  MONSOON: 1,
  COAST: 2,
  SOLAR: 3,
  FAULTLINE: 4,
  CINDERLINE: 5,
  NOCTILUCENT: 6,
  VESPER: 7,
});

export const COAST_LAYOUT_ID = "coast-4-finish-end";

export function isCoastLayout(layoutId: string) {
  // The archived v3 driving fixture exercises the original Coast geometry.
  return layoutId === COAST_LAYOUT_ID || layoutId === "coast-3";
}

export const TRACKS: TrackConfig[] = [
  { ...NEW_COURSES[0], subtitle: "01 / Polar observatory" },
  { ...NEW_COURSES[1], subtitle: "02 / Hydraulic city" },
  {
    name: "PALM BREAKER",
    curveType: "centripetal",
    subtitle: "03 / Sunshine air coast",
    color: 0x13d9e7,
    sky: 0x428ce8,
    fog: 0xa7dbe4,
    sea: 0x289aad,
    width: 18,
    branchWidths: [18, 18],
    // A broad common apron gives the two very different approaches room to
    // settle before the ravine turn; no change to steering or collision forces.
    widthSections: [
      { start: 0.43, fullStart: 0.442, fullEnd: 0.452, end: 0.47, width: 22 },
    ],
    layoutId: COAST_LAYOUT_ID,
    points: layoutPoints("coast"),
    banks: [
      [0.07, 0.27, 0.025],
      [0.46, 0.69, 0.025],
    ],
    ramp: { start: 0.811, height: 12, length: 0.009 },
    gapLength: 0.009,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.77, 0.9],
      longJump: [0.811, 0.9],
      cliffClimb: [0.065, 0.17],
      ravineTurns: [0.43, 0.5],
      headlandClimb: [0.53, 0.69],
      headlandBore: [0.332, 0.385],
      inletFlyover: [0.325, 0.415],
    },
    split: [0.285, 0.445],
    // Independent interior alignments retain the existing level fork necks.
    // The bore cuts beneath the headland; the flyover sweeps across the inlet.
    fork: {
      offsets: [-58, 65],
      rise: [0, 0],
      labels: ["BORE", "SKYWAY"],
      authored: {
        start: 0.315,
        end: 0.415,
        knots: [
          [
            [-1730, 145, 680],
            [-1980, 150, 850],
            [-2100, 230, 1170],
          ],
          [
            [-1710, 245, 950],
            [-1870, 330, 1320],
            [-2110, 310, 1380],
          ],
        ],
      },
    },
    jump: 0.82,
    tunnel: [0.11, 0.19],
  },
  {
    name: "SOLAR ARRAY",
    curveType: "centripetal",
    subtitle: "04 / High desert transmission",
    color: 0xff853a,
    sky: 0x65548d,
    fog: 0xc78d91,
    sea: 0x87535f,
    width: 19,
    branchWidths: [17, 19],
    layoutId: "solar-4-finish-end",
    points: layoutPoints("solar"),
    banks: [
      [0.08, 0.19, 0.02],
      [0.48, 0.55, 0.02],
      [0.77, 0.94, 0.025],
    ],
    ramp: { start: 0.631, height: 8, length: 0.009 },
    gapLength: 0.0075,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.59, 0.72],
      mountainTunnel: [0.2, 0.28],
      rockcutClimb: [0.07, 0.19],
      refinery: [0.28, 0.46],
      transmissionTurns: [0.77, 0.9],
    },
    split: [0.28, 0.46],
    jump: 0.64,
    tunnel: [0.2, 0.28],
  },
  FAULTLINE_COURSE,
  { ...NEW_COURSES[2], subtitle: "06 / Volcanic upland" },
  {
    name: "NOCTILUCENT",
    curveType: "centripetal",
    subtitle: "07 / Midnight freight loop",
    color: 0xff4f9b,
    sky: 0x15163e,
    fog: 0x293b68,
    sea: 0x103d58,
    width: 18,
    branchWidths: [16, 18],
    layoutId: "noctilucent-4-finish-end",
    night: true,
    points: layoutPoints("night"),
    banks: [
      [0.07, 0.25, 0.025],
      [0.56, 0.83, 0.025],
    ],
    ramp: { start: 0.471, height: 8, length: 0.009 },
    gapLength: 0.008,
    sections: {
      finishStraight: [0.955, 1.045],
      runway: [0.46, 0.555],
      upperBridge: [0.7, 0.8],
      mountainTunnel: [0.34, 0.39],
      hillOverpass: [0.31, 0.425],
      descent: [0.84, 0.955],
      freightClimb: [0.065, 0.18],
      westTerraces: [0.28, 0.425],
      upperApproach: [0.57, 0.81],
    },
    split: [0.28, 0.45],
    jump: 0.48,
    tunnel: [0.34, 0.39],
  },
  { ...NEW_COURSES[3], subtitle: "08 / Vertical neon metropolis" },
];
export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));

export function makeTrack(index: number): Track {
  const config = TRACKS[index];
  const curve = new THREE.CatmullRomCurve3(
    config.points.map((p) => new THREE.Vector3(...p)),
    true,
    config.curveType,
    0.45,
  );
  const length = curve.getLength();
  const count = Math.ceil(length / 3);
  const runway = config.sections.runway;
  const runwayStart = runway?.[0]!;
  const runwayEnd = runway?.[1]!;
  const approachPoint = (runway && curve.getPointAt(runwayStart))!;
  const landingPoint = (runway && curve.getPointAt(runwayEnd))!;
  const base = Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count;
    const p = curve.getPointAt(u);
    // Tangent-continuous entries/runouts preserve a real, long flight straight.
    const transition = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      da: THREE.Vector3,
      db: THREE.Vector3,
      t: number,
    ) =>
      a
        .clone()
        .multiplyScalar(2 * t * t * t - 3 * t * t + 1)
        .addScaledVector(da, t * t * t - 2 * t * t + t)
        .addScaledVector(b, -2 * t * t * t + 3 * t * t)
        .addScaledVector(db, t * t * t - t * t);
    const runwayDirection = (runway &&
      landingPoint
        .clone()
        .sub(approachPoint)
        .divideScalar(runwayEnd - runwayStart))!;
    const runwayFade = config.runwayEntryFade ?? 0.07;
    const runwayExitFade = config.runwayExitFade ?? runwayFade;
    if (runway && u >= runwayStart && u <= runwayEnd) {
      p.copy(approachPoint).lerp(
        landingPoint,
        (u - runwayStart) / (runwayEnd - runwayStart),
      );
    } else if (runway && u >= runwayStart - runwayFade && u < runwayStart) {
      p.copy(
        transition(
          curve.getPointAt(runwayStart - runwayFade),
          approachPoint,
          curve
            .getTangentAt(runwayStart - runwayFade)
            .multiplyScalar(length * runwayFade),
          runwayDirection.clone().multiplyScalar(runwayFade),
          (u - runwayStart + runwayFade) / runwayFade,
        ),
      );
    } else if (runway && u > runwayEnd && u <= runwayEnd + runwayExitFade) {
      p.copy(
        transition(
          landingPoint,
          curve.getPointAt(runwayEnd + runwayExitFade),
          config.runwayExitHandle === undefined
            ? runwayDirection.clone().multiplyScalar(runwayExitFade)
            : runwayDirection
                .clone()
                .normalize()
                .multiplyScalar(3 * config.runwayExitHandle),
          curve
            .getTangentAt(runwayEnd + runwayExitFade)
            .multiplyScalar(length * runwayExitFade),
          (u - runwayEnd) / runwayExitFade,
        ),
      );
    }
    // A genuine home straight spans the finish line, with generous transitions.
    const homeU = u < 0.5 ? u + 1 : u;
    const [homeStart, homeEnd] = config.sections.finishStraight;
    const homeFade = config.name === "SOLAR ARRAY" ? 0.06 : 0.055;
    const homeOutFade = config.night ? 0.075 : 0.1;
    const homeA = curve.getPointAt(homeStart);
    const homeB = curve.getPointAt(homeEnd - 1);
    if (config.night) {
      // A compact ~28-degree gravity drop has smooth entry and a long low runout.
      const top = curve.getPointAt(0.845).y;
      if (u >= 0.845)
        p.y = THREE.MathUtils.lerp(
          top,
          65,
          THREE.MathUtils.smoothstep(u, 0.845, 0.9),
        );
      if (u < 0.06)
        p.y = THREE.MathUtils.lerp(
          65,
          p.y,
          THREE.MathUtils.smoothstep(u, 0.025, 0.06),
        );
      homeA.y = homeB.y = 65;
    }
    const homeDirection = homeB
      .clone()
      .sub(homeA)
      .divideScalar(homeEnd - homeStart);
    if (homeU >= homeStart && homeU <= homeEnd) {
      p.copy(homeA).lerp(homeB, (homeU - homeStart) / (homeEnd - homeStart));
    } else if (homeU >= homeStart - homeFade && homeU < homeStart) {
      const outer = curve.getPointAt(homeStart - homeFade);
      const direction = isCoastLayout(config.layoutId)
        ? runwayDirection.clone()
        : curve.getTangentAt(homeStart - homeFade).multiplyScalar(length);
      if (config.night) {
        outer.y = 65;
        direction.y = 0;
      }
      p.copy(
        transition(
          outer,
          homeA,
          direction.multiplyScalar(homeFade),
          homeDirection.clone().multiplyScalar(homeFade * 1.25),
          (homeU - homeStart + homeFade) / homeFade,
        ),
      );
    } else if (homeU > homeEnd && homeU <= homeEnd + homeOutFade) {
      const outer = curve.getPointAt(homeEnd + homeOutFade - 1);
      const direction = curve
        .getTangentAt(homeEnd + homeOutFade - 1)
        .multiplyScalar(length);
      p.copy(
        transition(
          homeB,
          outer,
          homeDirection
            .clone()
            .multiplyScalar(homeOutFade * (config.night ? 1.25 : 1)),
          direction.multiplyScalar(homeOutFade),
          (homeU - homeEnd) / homeOutFade,
        ),
      );
    }
    // Authored coastal esses and desert outcrop turns displace the real deck,
    // not the steering. Zero first/second derivatives blend into existing
    // signatures; runway and home-straight windows remain untouched.
    const tangent = curve.getTangentAt(i / count).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    for (const bend of config.rhythm ?? []) {
      const t = (u - bend.start) / (bend.end - bend.start);
      if (t > 0 && t < 1)
        p.addScaledVector(
          right,
          bend.offset * Math.sin(Math.PI * t) ** 2 * Math.sin(2 * Math.PI * t),
        );
    }
    if (config.ramp && u >= config.ramp.start && u < config.jump!) {
      const t = (u - config.jump! + config.ramp.length) / config.ramp.length;
      // The integrated cosine arc joins with zero added slope/curvature,
      // then progressively rotates into a takeoff slope of 2 * height/length.
      const rise =
        config.ramp.profile === "arc" ? t - Math.sin(Math.PI * t) / Math.PI : t;
      p.y += rise * config.ramp.height;
    }
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return { p, tangent, right, up };
  });
  const returnRoute = config.returnRoute;
  if (returnRoute) {
    const station = (u: number) => {
      const n = u * count;
      return base[Math.floor(n)].p.clone().lerp(base[Math.ceil(n)].p, n % 1);
    };
    const points = [
      station(returnRoute.start),
      ...returnRoute.knots.map((p) => new THREE.Vector3(...p)),
      station(returnRoute.end),
    ];
    // Lock the first/last polygon legs to the retained deck's full 3D
    // tangents. Guide knots set their lengths, not a new seam direction.
    for (const [endpoint, guide, u, sign] of [
      [0, 1, returnRoute.start, 1],
      [points.length - 1, points.length - 2, returnRoute.end, -1],
    ]) {
      const tangent = station(u + 1 / count)
        .sub(station(u - 1 / count))
        .normalize();
      const distance = points[endpoint].distanceTo(points[guide]);
      points[guide]
        .copy(points[endpoint])
        .addScaledVector(tangent, sign * distance);
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    let previous = points[0];
    let previousTrim = 0;
    // Round the control polygon with sustained, physical-radius corners.
    // Entry/exit handles follow the graded straights, smoothing elevation as
    // well as heading; the unrounded legs are deliberate acceleration space.
    for (let i = 1; i < points.length - 1; i++) {
      const incoming = points[i].clone().sub(points[i - 1]);
      const outgoing = points[i + 1].clone().sub(points[i]);
      incoming.divideScalar(Math.hypot(incoming.x, incoming.z));
      outgoing.divideScalar(Math.hypot(outgoing.x, outgoing.z));
      const angle = Math.acos(
        clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1),
      );
      const radius = returnRoute.radii[i - 1];
      const trim = radius * Math.tan(angle / 2);
      const handle = (4 / 3) * radius * Math.tan(angle / 4);
      const leg = points[i].clone().sub(points[i - 1]);
      if (previousTrim + trim >= Math.hypot(leg.x, leg.z))
        throw new Error(`${config.name}: return corners overlap at knot ${i}`);
      previousTrim = trim;
      const entry = points[i].clone().addScaledVector(incoming, -trim);
      const exit = points[i].clone().addScaledVector(outgoing, trim);
      path.add(new THREE.LineCurve3(previous, entry));
      path.add(
        new THREE.CubicBezierCurve3(
          entry,
          entry.clone().addScaledVector(incoming, handle),
          exit.clone().addScaledVector(outgoing, -handle),
          exit,
        ),
      );
      previous = exit;
    }
    const finalLeg = points.at(-1)!.clone().sub(points.at(-2)!);
    if (previousTrim >= Math.hypot(finalLeg.x, finalLeg.z))
      throw new Error(
        `${config.name}: return corner consumes the exit straight`,
      );
    path.add(new THREE.LineCurve3(previous, points.at(-1)!));
    for (
      let i = Math.ceil(returnRoute.start * count);
      i <= Math.floor(returnRoute.end * count);
      i++
    )
      base[i].p.copy(
        path.getPoint(
          (i / count - returnRoute.start) /
            (returnRoute.end - returnRoute.start),
        ),
      );
  }
  // Fork offsets must follow the authored deck, including the added bends.
  if (config.rhythm || returnRoute)
    for (let i = 0; i <= count; i++) {
      const f = base[i];
      const u = i / count;
      if (
        !(config.rhythm ?? []).some((bend) => u > bend.start && u < bend.end) &&
        !(returnRoute && u >= returnRoute.start && u <= returnRoute.end)
      )
        continue;
      f.tangent = base[(i + 1) % count].p
        .clone()
        .sub(base[mod(i - 1, count)].p)
        .normalize();
      f.right.set(f.tangent.z, 0, -f.tangent.x).normalize();
      f.up.crossVectors(f.tangent, f.right).normalize();
    }
  const authored = config.fork?.authored;
  let authoredCurves: THREE.CurvePath<THREE.Vector3>[] | undefined;
  if (authored) {
    const neckPoint = (u: number, route: number) => {
      const n = u * count;
      const a = base[Math.floor(n)],
        b = base[Math.floor(n) + 1];
      const p = a.p.clone().lerp(b.p, n % 1);
      const right = a.right
        .clone()
        .lerp(b.right, n % 1)
        .normalize();
      const phase = (u - config.split[0]) / (config.split[1] - config.split[0]);
      return p.addScaledVector(
        right,
        config.fork!.offsets[route] * Math.sin(phase * Math.PI) ** 2,
      );
    };
    authoredCurves = authored.knots.map((knots, route) => {
      const points = [
        neckPoint(authored.start, route),
        ...knots.map((p) => new THREE.Vector3(...p)),
        neckPoint(authored.end, route),
      ];
      const tangents = points.map((p, i) => {
        if (i === 0 || i === points.length - 1) {
          const u = i === 0 ? authored.start : authored.end;
          const direction = neckPoint(u + 1 / count, route)
            .sub(neckPoint(u - 1 / count, route))
            .normalize();
          return direction.multiplyScalar(
            p.distanceTo(points[i === 0 ? 1 : i - 1]),
          );
        }
        return points[i + 1]
          .clone()
          .sub(points[i - 1])
          .multiplyScalar(0.5);
      });
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < points.length - 1; i++)
        path.add(
          new THREE.CubicBezierCurve3(
            points[i],
            points[i].clone().addScaledVector(tangents[i], 1 / 3),
            points[i + 1].clone().addScaledVector(tangents[i + 1], -1 / 3),
            points[i + 1],
          ),
        );
      return path;
    });
  }
  const routes: Record<number, RouteFrame[]> = {};
  for (const branch of [-1, 0, 1]) {
    const points = base.map((f, i) => {
      const phase = clamp(
        (i / count - config.split[0]) / (config.split[1] - config.split[0]),
        0,
        1,
      );
      const blend = Math.sin(phase * Math.PI) ** 2;
      if (
        authored &&
        branch &&
        i / count >= authored.start &&
        i / count <= authored.end
      )
        return authoredCurves![branch === -1 ? 0 : 1].getPoint(
          (i / count - authored.start) / (authored.end - authored.start),
        );
      const p = f.p
        .clone()
        .addScaledVector(f.right, branch * (branch === 1 ? 44 : 23) * blend);
      if (config.fork && branch) {
        const route = branch === -1 ? 0 : 1;
        p.copy(f.p).addScaledVector(
          f.right,
          config.fork.offsets[route] *
            blend *
            (config.fork.crossing ? Math.cos(phase * Math.PI) : 1),
        );
        const riseProfile = config.fork.riseProfile;
        const riseBlend = riseProfile
          ? THREE.MathUtils.smoothstep(phase, riseProfile[0], riseProfile[1]) *
            (1 -
              THREE.MathUtils.smoothstep(phase, riseProfile[2], riseProfile[3]))
          : blend;
        p.y += config.fork.rise[route] * riseBlend;
        // Route-local reverse bends displace the physical deck. Their compact
        // envelope has zero first/second derivatives at both ends, preserving
        // the common approach and merge rather than adding steering forces.
        for (const bend of config.fork.bends ?? []) {
          if (bend.branch !== branch) continue;
          const t = (phase - bend.start) / (bend.end - bend.start);
          if (t > 0 && t < 1)
            p.addScaledVector(
              f.right,
              bend.offset *
                Math.sin(Math.PI * t) ** 2 *
                Math.sin(2 * Math.PI * t),
            );
        }
        return p;
      }
      if (config.night && branch) {
        // Identity survives the crossover: +1 is always the hill route.
        // Flat entry/exit derivatives meet the common deck without a step.
        const envelope = Math.sin(Math.PI * phase) ** 2;
        const lateral =
          branch === -1
            ? -88 * envelope * Math.cos(Math.PI * phase)
            : 92 * envelope * Math.cos(Math.PI * phase);
        p.copy(f.p).addScaledVector(f.right, lateral);
        if (branch === 1)
          p.y +=
            45 *
            THREE.MathUtils.smoothstep(phase, 0.16, 0.4) *
            (1 - THREE.MathUtils.smoothstep(phase, 0.6, 0.84));
        return p;
      }
      // The fork is one level deck until its two carriageways separate.
      // Raising one half earlier creates a vertical step along the open seam.
      if (branch === 1) p.y += THREE.MathUtils.smoothstep(blend, 0.6, 1) * 12;
      return p;
    });
    routes[branch] = points.map((p, i) => {
      const previous = points[mod(i - 1, count)];
      const next = points[(i + 1) % count];
      const u = i / count;
      const beforeLaunch =
        config.jump !== null &&
        u < config.jump &&
        (i + 1) / count >= config.jump;
      const afterLaunch =
        config.jump !== null &&
        u >= config.jump &&
        (i - 1) / count < config.jump;
      const tangent = (
        beforeLaunch
          ? p.clone().sub(previous)
          : afterLaunch
            ? next.clone().sub(p)
            : next.clone().sub(previous)
      ).normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      return {
        p,
        tangent,
        right,
        metric:
          (beforeLaunch
            ? p.distanceTo(previous)
            : afterLaunch
              ? next.distanceTo(p)
              : next.distanceTo(previous) / 2) /
          (length / count),
      };
    });
    routes[branch][count] = routes[branch][0];
  }
  for (const frames of Object.values(routes)) {
    for (let i = 0; i < count; i++) {
      const before = frames[mod(i - 6, count)].tangent;
      const after = frames[(i + 6) % count].tangent;
      const turn = Math.atan2(
        before.z * after.x - before.x * after.z,
        before.dot(after),
      );
      frames[i].bank = clamp(
        (turn * 65) / ((12 * length) / count),
        -0.18,
        0.18,
      );
    }
  }
  // A full left/right reversal spans 0.36 radians. Spread its triangular
  // smoothing kernel over at least 0.36 / 0.008 = 45 track-station metres
  // on each side. Banking tests also check the final composed fade envelope.
  // The former 12-sample radius (~36 m) let saturated S-bends roll too fast.
  const bankSmoothingRadius = Math.ceil(0.36 / 0.008 / (length / count));
  for (const frames of Object.values(routes)) {
    const bank = frames.slice(0, count).map((f) => f.bank);
    for (let i = 0; i < count; i++) {
      let value = 0,
        weight = 0;
      for (let j = -bankSmoothingRadius; j <= bankSmoothingRadius; j++) {
        const w = bankSmoothingRadius + 1 - Math.abs(j);
        value += bank[mod(i + j, count)]! * w;
        weight += w;
      }
      frames[i].bank = value / weight;
    }
  }
  function frame(s: number, branch = 0): TrackFrame {
    const frames = routes[branch];
    let u = mod(s, length) / length;
    const atArcLip =
      config.ramp?.profile === "arc" &&
      Math.abs(u - config.jump!) <= Number.EPSILON * 4;
    if (atArcLip) u = config.jump!;
    const n = u * count;
    const index = atArcLip
      ? Math.ceil(config.jump! * count) - 1
      : Math.floor(n);
    const a = frames[index],
      b = frames[index + 1];
    const fraction = atArcLip ? n - index : n % 1;
    const arcLaunchCell =
      config.ramp?.profile === "arc" &&
      u <= config.jump! &&
      index / count < config.jump! &&
      (index + 1) / count >= config.jump!;
    const p = a.p.clone().lerp(b.p, fraction);
    const tangent = arcLaunchCell
      ? a.tangent.clone()
      : a.tangent.clone().lerp(b.tangent, fraction).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    // Composed banking lives only in selected bends, away from forks, ramps
    // and the start/finish. Both signs follow the actual local turn direction.
    const window = (start: number, end: number, fade: number) =>
      THREE.MathUtils.smoothstep(u, start, start + fade) *
      (1 - THREE.MathUtils.smoothstep(u, end - fade, end));
    const envelope = config.banks
      ? Math.max(
          ...config.banks.map(([start, end, fade]) => window(start, end, fade)),
        )
      : Math.max(
          window(0.05, 0.22, 0.035),
          config.name === "SOLAR ARRAY"
            ? window(0.78, 0.94, 0.04)
            : config.night
              ? window(0.76, 0.82, 0.02)
              : window(0.48, 0.69, 0.04),
        );
    const bank = THREE.MathUtils.lerp(a.bank!, b.bank!, fraction) * envelope;
    right.applyAxisAngle(tangent, -bank);
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const [start, end] = config.split;
    const split = u > start && u < end;
    const mainWidth = config.widthSections
      ? config.widthSections.reduce((width, section) => {
          const envelope =
            THREE.MathUtils.smoothstep(u, section.start, section.fullStart) *
            (1 - THREE.MathUtils.smoothstep(u, section.fullEnd, section.end));
          return width + (section.width - config.width) * envelope;
        }, config.width)
      : config.width;
    const phase = clamp((u - start) / (end - start), 0, 1);
    const narrowing = THREE.MathUtils.smoothstep(
      Math.sin(phase * Math.PI) ** 2,
      0,
      0.3,
    );
    // The ramp is already in the authored points and their physical tangents.
    // Do not interpolate the last pre-lip sample down into the absent gap deck.
    if (
      config.jump !== null &&
      (u < config.jump || arcLaunchCell) &&
      (index + 1) / count >= config.jump
    )
      p.copy(a.p).addScaledVector(
        a.tangent,
        (u - index / count) * length * a.metric,
      );
    return {
      p,
      tangent,
      right,
      up,
      bank,
      u,
      width:
        split && branch !== 0
          ? mainWidth -
            (mainWidth - config.branchWidths[branch === -1 ? 0 : 1]) * narrowing
          : mainWidth,
      metric: arcLaunchCell
        ? a.metric
        : a.metric + (b.metric - a.metric) * fraction,
    };
  }
  function gap(u: number) {
    return (
      config.jump !== null &&
      u >= config.jump &&
      u < config.jump + config.gapLength!
    );
  }
  function curvature(s: number, branch = 0) {
    const a = frame(s - 6, branch),
      b = frame(s + 6, branch);
    // Small-window signed tangent turn per physical metre. Authored alignments
    // can compress or stretch station spacing independently of world distance.
    return (
      Math.atan2(
        a.tangent.z * b.tangent.x - a.tangent.x * b.tangent.z,
        a.tangent.dot(b.tangent),
      ) / a.p.distanceTo(b.p)
    );
  }
  function isTunnel(s: number, branch = 0) {
    const u = mod(s, length) / length;
    const enclosedBranch = config.tunnelBranches
      ? config.tunnelBranches.includes(branch)
      : !isCoastLayout(config.layoutId) && (!config.night || branch === -1);
    return (
      config.tunnel !== null &&
      enclosedBranch &&
      u > config.tunnel[0] &&
      u < config.tunnel[1]
    );
  }
  const physicalLengths = Object.fromEntries(
    Object.entries(routes).map(([branch, frames]) => [
      branch,
      frames
        .slice(0, count)
        .reduce((sum, f, i) => sum + f.p.distanceTo(frames[i + 1].p), 0),
    ]),
  );
  if (config.night) {
    const candidates = routes[0]
      .slice(0, count)
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => Math.hypot(f.p.x + 936, f.p.z) < 35);
    const cross = (ax: number, az: number, bx: number, bz: number) =>
      ax * bz - az * bx;
    const intersections: TrackCrossing[] = [];
    for (const a of candidates)
      for (const b of candidates) {
        if (b.i - a.i < count / 4) continue;
        const ap = a.f.p,
          aq = routes[0][a.i + 1].p;
        const bp = b.f.p,
          bq = routes[0][b.i + 1].p;
        const ax = aq.x - ap.x,
          az = aq.z - ap.z,
          bx = bq.x - bp.x,
          bz = bq.z - bp.z;
        const denominator = cross(ax, az, bx, bz);
        if (denominator === 0) continue;
        const ta = cross(bp.x - ap.x, bp.z - ap.z, bx, bz) / denominator;
        const tb = cross(bp.x - ap.x, bp.z - ap.z, ax, az) / denominator;
        if (ta < 0 || ta >= 1 || tb < 0 || tb >= 1) continue;
        const ua = (a.i + ta) / count,
          ub = (b.i + tb) / count;
        const pa = frame(ua * length).p,
          pb = frame(ub * length).p;
        const upperU = pa.y > pb.y ? ua : ub,
          lowerU = pa.y > pb.y ? ub : ua;
        intersections.push({
          upperU,
          lowerU,
          clearance: Math.abs(pa.y - pb.y),
          point: [pa.x, pa.z],
          upperSpan: [upperU - 0.05, upperU + 0.05],
        });
      }
    config.sections.crossings = intersections;
    config.sections.upperBridge = intersections[0].upperSpan;
  }
  // Authored stations stay fixed: scenery, forks and physical geometry do not
  // rotate when the timing origin moves to the downstream end of the straight.
  const finishS = (config.sections.finishStraight[1] - 1) * length;
  const track = {
    config,
    length,
    finishS,
    physicalLengths,
    physicalLength: physicalLengths[0],
    frame,
    gap,
    curvature,
    isTunnel,
  } as Track;
  track.bounds = (s: number, branch = 0) => roadBounds(track, s, branch);
  return track;
}

export function roadBounds(
  track: Pick<Track, "config" | "frame">,
  s: number,
  branch = 0,
): RoadBounds {
  const f = track.frame(s, branch);
  const result: RoadBounds = {
    clipMin: -f.width,
    clipMax: f.width,
    wallMin: -f.width,
    wallMax: f.width,
    connected: false,
    seam: null,
    innerSide: -branch,
    railMinHeight: RAIL_PROFILE.height,
    railMaxHeight: RAIL_PROFILE.height,
  };
  // Include authored endpoints despite modulo/division roundoff at exact mesh stations.
  const epsilon = Number.EPSILON * 4;
  if (
    !branch ||
    f.u < track.config.split[0] - epsilon ||
    f.u > track.config.split[1] + epsilon
  )
    return result;
  const other = track.frame(s, -branch);
  const axis = track.frame(s, 0).right;
  const separation = other.p.clone().sub(f.p).dot(axis);
  // Authored forks can meet at precisely identical centres. Keep one shared
  // seam even when the branch tangents differ at that exact endpoint.
  const ownIsLeft = separation === 0 ? branch === -1 : separation >= 0;
  const left = ownIsLeft ? f : other;
  const right = ownIsLeft ? other : f;
  result.innerSide = ownIsLeft ? 1 : -1;
  const leftInner = left.p.clone().addScaledVector(left.right, left.width);
  const rightInner = right.p.clone().addScaledVector(right.right, -right.width);
  const phase =
    (f.u - track.config.split[0]) /
    (track.config.split[1] - track.config.split[0]);
  const independentCrossing = track.config.night || track.config.fork?.crossing;
  const seamRegion = !independentCrossing || phase < 0.18 || phase > 0.82;
  result.connected =
    seamRegion &&
    leftInner.clone().sub(rightInner).dot(axis) >= 0 &&
    Math.abs(leftInner.y - rightInner.y) <= 0.05;
  if (!result.connected) {
    const independentQuarry =
      track.config.biome === "quarry" &&
      track.config.fork?.authored &&
      f.u >= track.config.fork.authored.start &&
      f.u <= track.config.fork.authored.end;
    // These independent decks can overlap in the reference alignment's XZ
    // projection while remaining far apart in 3D. Only their coplanar necks
    // share a taper; the separated BORE/BENCH roads keep complete barriers.
    if (!seamRegion || independentQuarry) return result;
    const gap = Math.max(0, rightInner.clone().sub(leftInner).dot(axis));
    const slope = RAIL_PROFILE.topOutset / RAIL_PROFILE.height;
    const expansion =
      left.up.dot(axis) -
      right.up.dot(axis) +
      slope * (left.right.dot(axis) + right.right.dot(axis));
    const innerHeight = Math.min(RAIL_PROFILE.height, gap / expansion);
    if (ownIsLeft) result.railMaxHeight = innerHeight;
    else result.railMinHeight = innerHeight;
    return result;
  }
  // One shared world-space vertex prevents cracks between nonparallel halves.
  // The seam lies in the actual overlap, including unequal branch widths.
  result.seam = leftInner.add(rightInner).multiplyScalar(0.5);
  const seamX = result.seam.clone().sub(f.p).dot(f.right);
  const offset = other.p.clone().sub(f.p).dot(f.right);
  const projectedWidth = other.width * other.right.dot(f.right);
  if (ownIsLeft) {
    result.clipMax = Math.min(f.width, seamX);
    result.wallMax = offset + projectedWidth;
  } else {
    result.clipMin = Math.max(-f.width, seamX);
    result.wallMin = offset - projectedWidth;
  }
  return result;
}
