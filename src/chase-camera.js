// Project only onto the racer's local route: a global nearest-road query can
// attach the camera to the upper deck at an over/under crossing.
export function chaseCameraSurface(track, contactS, branch, position, terrain) {
  let s = contactS;
  for (let i = 0; i < 5; i++) {
    const f = track.frame(s, branch);
    const dx = position.x - f.p.x;
    const dz = position.z - f.p.z;
    s +=
      (dx * f.tangent.x + dz * f.tangent.z) /
      ((f.tangent.x ** 2 + f.tangent.z ** 2) * f.metric);
  }
  const f = track.frame(s, branch);
  const dx = position.x - f.p.x;
  const dz = position.z - f.p.z;
  const dy = -(f.up.x * dx + f.up.z * dz) / f.up.y;
  const lateral = dx * f.right.x + dy * f.right.y + dz * f.right.z;
  let height = -Infinity;
  if (!track.gap(f.u) && Math.abs(lateral) <= f.width) height = f.p.y + dy;
  // Bored tunnel roofs are above the road, not a camera floor.
  if (!track.isTunnel(s, branch))
    height = Math.max(height, terrain.heightAt(position.x, position.z));
  return height;
}

export function clearChaseCamera(position, track, player, terrain, clearance) {
  position.y = Math.max(
    position.y,
    chaseCameraSurface(
      track,
      player.contactS,
      player.branch,
      position,
      terrain,
    ) + clearance,
  );
}
