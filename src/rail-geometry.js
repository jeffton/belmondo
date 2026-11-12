import { RAIL_PROFILE } from "./rail-profile.js";

export function railHeight(frame, side) {
  if (frame.connected && side === frame.innerSide) return 0;
  return side < 0 ? frame.railMinHeight : frame.railMaxHeight;
}

/** Exact shared physical face, extruded outwards along the banked road frame. */
export function railPoint(frame, edge, side, height, depth = 0) {
  const h = height < 0 ? height : Math.min(height, railHeight(frame, side));
  const seam =
    frame.seam &&
    ((frame.innerSide === 1 && edge === frame.clipMax) ||
      (frame.innerSide === -1 && edge === frame.clipMin));
  const base = seam
    ? frame.seam.clone()
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
export function railBackDepth(track, frame, side) {
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
  const axis = track.frame(frame.u * track.length).right;
  const gap = Math.max(
    0,
    b.p
      .clone()
      .addScaledVector(b.right, -b.width)
      .sub(a.p.clone().addScaledVector(a.right, a.width))
      .dot(axis),
  );
  return Math.min(
    1.1,
    Math.max(
      0,
      gap / 2 -
        (railHeight(frame, side) * RAIL_PROFILE.topOutset) /
          RAIL_PROFILE.height,
    ),
  );
}
