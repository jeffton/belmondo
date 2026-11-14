export const TEST_ACCESS_KEY = "nv-test-access";

/** Local circuit access, deliberately separate from wins and saved records. */
export function createCircuitTestAccess(storage, onChange = () => {}) {
  let enabled = storage.getItem(TEST_ACCESS_KEY) === "on";
  let taps = 0;
  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      storage.setItem(TEST_ACCESS_KEY, enabled ? "on" : "off");
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

export function mountCircuitTestAccess(access, canToggle) {
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
  document.querySelector(".wordmark").addEventListener("click", () => {
    if (canToggle()) access.tapLogo();
  });
  return () => {
    badge.hidden = !access.enabled;
  };
}
