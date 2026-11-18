/** Test circuit access lasts for this page only. */
export function createCircuitTestAccess(
  onChange: (enabled: boolean) => void = () => {},
) {
  let enabled = false;
  let taps = 0;
  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      onChange(enabled);
      return enabled;
    },
    tapLogo() {
      if (++taps !== 5) return false;
      taps = 0;
      this.toggle();
      return true;
    },
  };
}

export function mountCircuitTestAccess(
  access: ReturnType<typeof createCircuitTestAccess>,
  canToggle: () => boolean,
) {
  const badge = document.createElement("button");
  badge.id = "circuit-test-access";
  badge.type = "button";
  badge.textContent = "TEST · NO RECORDS";
  badge.title = "Test circuit access. Tap here in the paddock to turn off.";
  badge.hidden = !access.enabled;
  badge.onclick = () => {
    if (canToggle()) access.toggle();
  };
  document.body.append(badge);
  document.querySelector(".wordmark")!.addEventListener("click", () => {
    if (canToggle()) access.tapLogo();
  });
  return () => {
    badge.hidden = !access.enabled;
  };
}
