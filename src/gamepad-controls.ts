// Standard Gamepad mapping: A thrust, X fire, Y view, L2/R2 airbrakes.
export function gamepadFlightControls(
  pad: Pick<Gamepad, "buttons">,
  aConsumed = false,
) {
  return {
    throttle: Number(Boolean(pad.buttons[0]?.pressed && !aConsumed)),
    airLeft: pad.buttons[6]?.value || 0,
    airRight: pad.buttons[7]?.value || 0,
  };
}
