import type { Track, TrackFrame, RoadBounds } from "./track.ts";
import { RAIL_PROFILE } from "./rail-profile.ts";

export function railHeight(
  frame: TrackFrame & RoadBounds & { branch?: number },
  side: number,
) {
  if (frame.connected && side === frame.innerSide) return 0;
  return side < 0 ? frame.railMinHeight : frame.railMaxHeight;
}

/** Exact shared physical face, extruded outwards along the banked road frame. */
export function railPoint(
  frame: TrackFrame & RoadBounds & { branch?: number },
  edge: number,
  side: number,
  height: number,
  depth = 0,
) {
  const h = height < 0 ? height : Math.min(height, railHeight(frame, side));
  const seam =
    frame.seam &&
    ((frame.innerSide === 1 && edge === frame.clipMax) ||
      (frame.innerSide === -1 && edge === frame.clipMin));
  const base = seam
    ? frame.seam!.clone()
    : frame.p.clone().addScaledVector(frame.right, edge);
  return base
    .addScaledVector(frame.up, h)
    .addScaledVector(
      frame.right,
      side *
        ((Math.max(0, h) * RAIL_PROFILE.topOutset) / RAIL_PROFILE.height +
          depth),
    );
}

/** Opposed median faces meet without extending their caps into the other route. */
export function railBackDepth(
  track: Track,
  frame: TrackFrame & RoadBounds & { branch?: number },
  side: number,
) {
  if (!frame.branch || side !== frame.innerSide) return 1.1;
  const a = track.frame(
      frame.u * track.length,
      frame.innerSide === 1 ? frame.branch : -frame.branch,
    ),
    b = track.frame(
      frame.u * track.length,
      frame.innerSide === 1 ? -frame.branch : frame.branch,
    );
  if (Math.abs(a.p.y - b.p.y) > 0.05) return 1.1;
  const station = frame.u * track.length;
  const axis = track.frame(station).right;
  const leftBranch = frame.innerSide === 1 ? frame.branch : -frame.branch;
  Object.assign(a, track.bounds(station, leftBranch));
  Object.assign(b, track.bounds(station, -leftBranch));
  // Height follows each road normal, not world vertical. On a rising fork the
  // two normals lean towards the median, consuming some of the cap clearance.
  const left = railPoint(
    a as TrackFrame & RoadBounds,
    (a as TrackFrame & RoadBounds).clipMax,
    1,
    RAIL_PROFILE.height,
  );
  const right = railPoint(
    b as TrackFrame & RoadBounds,
    (b as TrackFrame & RoadBounds).clipMin,
    -1,
    RAIL_PROFILE.height,
  );
  const clearance = right.sub(left).dot(axis);
  return Math.min(1.1, Math.max(0, clearance / (2 * frame.right.dot(axis))));
}
