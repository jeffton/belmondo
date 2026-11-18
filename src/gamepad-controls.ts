// Standard Gamepad mapping: A thrust, B fire, X scrap, Y view, L2/R2 airbrakes.
export const FIRE_BUTTON = 1;
export const SCRAP_BUTTON = 2;
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
