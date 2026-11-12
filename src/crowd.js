// The rendered stand foundations supply the real world-space footprints.
// A 180 m acoustic falloff gives fast approaches room to swell naturally.
export function getCrowdMix(position, listenerRight, stands) {
  let gain = 0;
  let panSum = 0;
  let weightSum = 0;
  for (const stand of stands) {
    if (!stand.spectator) continue;
    const dx = position.x - stand.center.x;
    const dz = position.z - stand.center.z;
    const x = Math.max(
      -stand.width / 2,
      Math.min(stand.width / 2, dx * stand.right.x + dz * stand.right.z),
    );
    const z = Math.max(
      -stand.length / 2,
      Math.min(stand.length / 2, dx * stand.forward.x + dz * stand.forward.z),
    );
    const sx =
      stand.center.x + stand.right.x * x + stand.forward.x * z - position.x;
    const sy = stand.deck - position.y;
    const sz =
      stand.center.z + stand.right.z * x + stand.forward.z * z - position.z;
    const distance = Math.hypot(sx, sy, sz);
    const falloff = Math.max(0, 1 - (distance / 180) ** 2) ** 2;
    gain = Math.max(gain, falloff * 0.5);
    const weight = falloff ** 2;
    const pan =
      distance === 0
        ? 0
        : (sx * listenerRight.x + sy * listenerRight.y + sz * listenerRight.z) /
          distance;
    panSum += pan * weight;
    weightSum += weight;
  }
  return { gain, pan: weightSum > 0 ? panSum / weightSum : 0 };
}
