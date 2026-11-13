// Combine differential yaw and paired slowing within the real trigger range.
// Shared drag cannot consume the trigger headroom required for yaw.
export function pilotInputs({
  throttle,
  steer,
  air = 0,
  slowing = 0,
  pitch = 0,
}) {
  const paired = slowing * (1 - Math.abs(air));
  return {
    throttle: Number(throttle),
    steer,
    airLeft: paired + Math.max(0, air),
    airRight: paired + Math.max(0, -air),
    pitch,
  };
}
