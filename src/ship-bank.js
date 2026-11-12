// Hull lean only: heading, grip and the road's banking remain physical/direct.
export function steeringBank(yawRate) {
  return Math.max(-0.5, Math.min(0.5, -yawRate * 0.45));
}

export function updateShipBank(previous, target, dt, digital) {
  if (dt === 0) return previous;
  if (!digital) return target;
  // Quick turn-in, with a little more weight as a tapped key is released.
  const turningIn =
    Math.abs(target) > Math.abs(previous) || previous * target < 0;
  const response = turningIn ? 0.07 : 0.12;
  return previous + (target - previous) * (1 - Math.exp(-dt / response));
}
