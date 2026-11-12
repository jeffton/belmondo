import { hullExtent, HULL_HEIGHT } from "./contacts.js";

// Both render extrusion and physical contact use this outward-sloping face.
export const RAIL_PROFILE = Object.freeze({ height: 2.4, topOutset: 1.2 });

export function railFaceNormal(road, side) {
  return road.right
    .clone()
    .multiplyScalar(side)
    .addScaledVector(road.up, -RAIL_PROFILE.topOutset / RAIL_PROFILE.height);
}

export function railBounds(hull, road, position) {
  const offset = position.clone().sub(road.point);
  const h = offset.dot(road.up);
  const supportUp =
    hullExtent(hull, road.up) + (HULL_HEIGHT / 2) * Math.abs(road.up.y);
  const slope = RAIL_PROFILE.topOutset / RAIL_PROFILE.height;
  const support = (side) => {
    const normal = railFaceNormal(road, side);
    return hullExtent(hull, normal) + (HULL_HEIGHT / 2) * Math.abs(normal.y);
  };
  // Road x is the deck's XZ coordinate; contact is on its actual 3D face.
  const originOffset = offset.dot(road.wallAxis) - offset.dot(road.right);
  return {
    min: road.wallMin - slope * h + support(-1) + originOffset,
    max: road.wallMax + slope * h - support(1) + originOffset,
    intersectsMin: h + supportUp >= 0 && h - supportUp <= road.railMinHeight,
    intersectsMax: h + supportUp >= 0 && h - supportUp <= road.railMaxHeight,
  };
}

export function respondToRail(hull, road, side) {
  const normal = railFaceNormal(road, side);
  const outward = hull.velocity.dot(normal);
  if (outward <= 0) return;
  const previousUp = hull.velocity.dot(road.up);
  hull.velocity.addScaledVector(normal, (-outward * 1.25) / normal.lengthSq());
  // The impact shoe absorbs a positive upward kick, not the energy transfer
  // of a descending impact. Reflection and this damping both remove energy.
  const upwardKick = hull.velocity.dot(road.up) - Math.max(0, previousUp);
  if (upwardKick > 0) hull.velocity.addScaledVector(road.up, -upwardKick);
}
