import * as THREE from "three";
import { RAIL_PROFILE } from "./rail-profile.ts";
import { TRACKS, isCoastLayout } from "./track-catalog.ts";
import { clamp, mod } from "./track-math.ts";
import { buildTrackPath } from "./track-path.ts";

export {
  TRACKS,
  TRACK_INDEX,
  COAST_LAYOUT_ID,
  isCoastLayout,
} from "./track-catalog.ts";
export { clamp, mod } from "./track-math.ts";

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
export function makeTrack(index: number): Track {
  const config = TRACKS[index];
  const { length, count, routes } = buildTrackPath(config);
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
