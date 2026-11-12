/** Explicit environments; unknown courses must never become a coastal city. */
export const NEW_COURSE_RECIPES = {
  WHITEOUT: {
    biome: "polar",
    ground: [0.54, 0.25, 0.68],
    rock: 0x769da9,
    wall: 0x284d61,
    pale: 0xd4e6e7,
    accent: 0xdf7b34,
    vegetation: 0x648a99,
    districts: [
      { name: "ICE CORE OBSERVATORY", u: 0.335, side: -1, kind: "observatory" },
      { name: "BASIN SURVEY", u: 0.445, side: 1, kind: "survey" },
      { name: "VALLEY WEATHER STATION", u: 0.77, side: -1, kind: "weather" },
    ],
    approaches: [
      { name: "EXPEDITION STORES", u: 0.13, side: 1, kind: "cold-store" },
      { name: "GLACIAL ENTRY FACE", u: 0.28, side: 1, kind: "iceface" },
      { name: "BASIN BLUE ICE", u: 0.39, side: -1, kind: "iceface" },
      { name: "VALLEY CORE DEPOT", u: 0.62, side: -1, kind: "cold-store" },
      { name: "UPPER PASS RELAY", u: 0.9, side: -1, kind: "weather" },
    ],
  },
  MONSOON: {
    biome: "hydraulic",
    ground: [0.26, 0.33, 0.31],
    rock: 0x6a8170,
    wall: 0x687f75,
    pale: 0xc5d8ce,
    accent: 0xe2be54,
    vegetation: 0x397751,
    districts: [
      { name: "UPPER RESERVOIR", u: 0.21, side: 1, kind: "reservoir" },
      { name: "PUMP ISLAND", u: 0.44, side: 1, kind: "pump-island" },
      { name: "GARDEN INTAKE", u: 0.73, side: -1, kind: "terraces" },
    ],
    approaches: [
      { name: "HEADWATER GARDENS", u: 0.12, side: -1, kind: "terraces" },
      { name: "DESCENT PRESSURE WORKS", u: 0.245, side: 1, kind: "pipe-yard" },
      { name: "LOWER LOCK SERVICES", u: 0.5, side: -1, kind: "pumps" },
      { name: "HIGH INTAKE TERRACES", u: 0.88, side: 1, kind: "terraces" },
    ],
  },
  CINDERLINE: {
    biome: "volcanic",
    ground: [0.59, 0.07, 0.19],
    rock: 0x363e43,
    wall: 0x48545d,
    pale: 0xd3e3e9,
    accent: 0xd4ce49,
    vegetation: 0x8b8b56,
    districts: [
      { name: "CALDERA EXCHANGE", u: 0.21, side: -1, kind: "geothermal" },
      { name: "SULFUR CUT", u: 0.435, side: 1, kind: "basalt" },
      { name: "CONDENSER FIELD", u: 0.78, side: -1, kind: "condenser" },
    ],
    approaches: [
      { name: "RIDGE STEAM MAINS", u: 0.1, side: 1, kind: "pipe-yard" },
      { name: "COLUMNAR CUT", u: 0.31, side: -1, kind: "basalt" },
      { name: "LOWER CALDERA MAINS", u: 0.55, side: 1, kind: "pipe-yard" },
      { name: "RIM BASALT FACE", u: 0.675, side: -1, kind: "basalt" },
      { name: "RETURN HEAT EXCHANGE", u: 0.91, side: 1, kind: "pipe-yard" },
    ],
  },
};

export function newCourseRecipe(track) {
  return NEW_COURSE_RECIPES[track.config.name] || null;
}

export function assertKnownEnvironment(track) {
  if (
    !["KAISEKI COAST", "SOLAR ARRAY", "NOCTILUCENT"].includes(
      track.config.name,
    ) &&
    !newCourseRecipe(track)
  )
    throw new Error(`Unknown course environment: ${track.config.name}`);
}

/** Landforms outside the banked road's excavation envelope. */
export function biomeLandHeight(recipe, x, z, context) {
  const { centerX, centerZ, radiusX, radiusZ, distance, roadY } = context;
  const nx = (x - centerX) / radiusX;
  const nz = (z - centerZ) / radiusZ;
  const r = Math.hypot(nx, nz);
  if (recipe.biome === "polar") {
    // Asymmetric enclosing ice ridges; the distant outer shelf drops to ocean.
    const basinRadius = Math.hypot(x / 530, z / 530);
    const rim = Math.exp(-(((basinRadius - 1) / 0.29) ** 2));
    const inland = 1 - Math.min(1, Math.max(0, (basinRadius - 1.3) / 0.65));
    return (
      -32 +
      inland * 77 +
      rim * (185 + 70 * Math.sin(x * 0.0041 + z * 0.0023) ** 2) +
      14 * Math.sin(x * 0.003 + z * 0.005)
    );
  }
  if (recipe.biome === "hydraulic") {
    // Broad green hills and stepped agriculture outside the excavated lock.
    const hills = 28 + 65 * Math.sin(x * 0.0026 - z * 0.0018) ** 2;
    return Math.floor((hills + 18 * Math.cos(z * 0.004)) / 12) * 12;
  }
  // A broad caldera rim surrounds dark exposed rock. Yellow is mineral staining,
  // not a second sandstone desert or a glowing red lava sea.
  const rim = Math.exp(-(((r - 0.8) / 0.22) ** 2));
  return (
    8 +
    rim * (105 + 45 * Math.cos(nx * 5 - nz * 3) ** 2) +
    Math.min(distance, 220) * 0.025 +
    8 * Math.sin((x + z) * 0.012) +
    roadY * 0.04
  );
}
