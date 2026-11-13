// Original instrument glyphs share silhouettes across inventory and flight briefing.
export const WEAPON_UI = {
  MISSILE: {
    color: "#ff535b",
    description: "Homing missile / 220 m lock",
    glyph:
      '<path d="m24 5 6 13v13l8 8H10l8-8V18Z"/><path d="M21 40h6l-3 5Z"/><path d="M22 19h4v10h-4Z" fill="#10202c"/>',
  },
  PULSE: {
    color: "#ff63db",
    description: "Short-range forward shockwave",
    glyph:
      '<path d="M20 19h8v10h-8Z"/><path d="M14 13a16 16 0 0 0 0 22M34 13a16 16 0 0 1 0 22M8 7a25 25 0 0 0 0 34M40 7a25 25 0 0 1 0 34" fill="none" stroke="currentColor" stroke-width="3"/>',
  },
  MINE: {
    color: "#ffbf47",
    description: "Persistent rear proximity charge",
    glyph:
      '<path d="m19 17 2-12h6l2 12-5 3ZM16 25l5 8-10 9-5-9ZM32 25l10 8-5 9-10-9Z"/><path d="m24 17 7 4v8l-7 4-7-4v-8Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="25" r="3"/>',
  },
  SHIELD: {
    color: "#66edee",
    description: "5 s protection + shield repair",
    glyph:
      '<path d="m24 5 16 6v14L24 43 8 25V11Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 14h4v7h7v4h-7v7h-4v-7h-7v-4h7Z"/>',
  },
  TURBO: {
    color: "#609bff",
    description: "2.4 s overdrive",
    glyph:
      '<path d="M29 3 12 27h11l-4 18 18-26H26Z"/><path d="M6 14h9v3H6ZM3 22h7v3H3ZM33 32h9v3h-9Z"/>',
  },
};

function icon(glyph) {
  return `<svg class="weapon-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="currentColor">${glyph}</svg>`;
}

export function createWeaponHUD(desktop, touch, roster) {
  for (const [name, item] of Object.entries(WEAPON_UI)) {
    const heading = document.createElement("b");
    heading.style.setProperty("--weapon-color", item.color);
    heading.innerHTML = `${icon(item.glyph)}<span>${name}</span>`;
    const description = document.createElement("span");
    description.textContent = item.description;
    roster.append(heading, description);
  }
  touch.setAttribute("aria-label", "Fire weapon");
  let current = Symbol("uninitialized");
  return (weapon) => {
    if (weapon === current) return;
    current = weapon;
    const item = weapon ? WEAPON_UI[weapon] : null;
    desktop.parentElement.hidden = !item;
    touch.disabled = !item;
    touch.setAttribute("aria-label", item ? `Fire ${weapon}` : "Fire weapon");
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
