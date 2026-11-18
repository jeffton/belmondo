import { toMetres } from "./units.ts";

// Cutout instrument pictograms keep each silhouette distinct even without tint.
export const WEAPON_UI = {
  MISSILE: {
    color: "#ff535b",
    description: `Homing missile / ${Math.round(toMetres(220))} m lock`,
    glyph:
      '<path d="M43 5 29 9 19 18 11 19 6 25 14 26 6 35 15 34 13 42 21 35 24 40 29 34 30 26 39 17Z"/>',
  },
  PULSE: {
    color: "#ff63db",
    description: "Short-range forward shockwave",
    glyph:
      '<path d="M13 8 17 12 10 20V28L17 36 13 40 4 30V18ZM35 8 44 18V30L35 40 31 36 38 28V20L31 12ZM20 19H28L31 24 28 29H20L17 24Z"/>',
  },
  MINE: {
    color: "#ffbf47",
    description: "Persistent rear proximity charge",
    glyph:
      '<path fill-rule="evenodd" d="M21 4H27V10L33 13 38 8 42 12 37 17 39 21H45V27H39L37 31 42 36 38 40 33 35 27 38V44H21V38L15 35 10 40 6 36 11 31 9 27H3V21H9L11 17 6 12 10 8 15 13 21 10ZM24 18 18 24 24 30 30 24Z"/>',
  },
  SHIELD: {
    color: "#66edee",
    description: "5 s protection + shield repair",
    glyph:
      '<path fill-rule="evenodd" d="M24 4 41 11V27L24 44 7 27V11ZM24 10 12 15V25L24 37 36 25V15Z"/><path d="M22 15H26V21H32V25H26V31H22V25H16V21H22Z"/>',
  },
  TURBO: {
    color: "#609bff",
    description: "2.4 s overdrive",
    glyph:
      '<path d="M3 10H14L27 24 14 38H3L16 24ZM23 10H34L47 24 34 38H23L36 24Z"/>',
  },
};

export type WeaponName = keyof typeof WEAPON_UI;

function icon(glyph: string) {
  return `<svg class="weapon-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="currentColor">${glyph}</svg>`;
}

export function createWeaponHUD(
  desktop: HTMLElement,
  touch: HTMLButtonElement,
  roster: HTMLElement,
) {
  for (const [name, item] of Object.entries(WEAPON_UI)) {
    const heading = document.createElement("b");
    heading.style.setProperty("--weapon-color", item.color);
    heading.innerHTML = `${icon(item.glyph)}<span>${name}</span>`;
    const description = document.createElement("span");
    description.textContent = item.description;
    roster.append(heading, description);
  }
  touch.setAttribute("aria-label", "Fire weapon");
  let current: WeaponName | null | symbol = Symbol("uninitialized");
  return (weapon: WeaponName | null) => {
    if (weapon === current) return;
    current = weapon;
    const item = weapon ? WEAPON_UI[weapon] : null;
    desktop.parentElement!.hidden = !item;
    touch.disabled = !item;
    touch.setAttribute(
      "aria-label",
      item ? `Fire ${weapon}` : "No weapon equipped",
    );
    touch.innerHTML = item
      ? `${icon(item.glyph)}<span class="weapon-name">${weapon}</span>`
      : '<span class="weapon-empty" aria-hidden="true">EMPTY</span>';
    touch.style.setProperty("--weapon-color", item?.color || "#a6bec8");
    if (!item) {
      desktop.replaceChildren();
      desktop.removeAttribute("aria-label");
      return;
    }
    desktop.style.setProperty("--weapon-color", item.color);
    desktop.setAttribute("aria-label", `Fire ${weapon}`);
    desktop.innerHTML = `${icon(item.glyph)}<span class="weapon-copy"><b class="weapon-name">${weapon}</b></span>`;
  };
}
