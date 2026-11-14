/** Explicit environments; unknown courses must never become a coastal city. */
export const NEW_COURSE_RECIPES = {
  "VESPER CIRCUIT": {
    biome: "metropolis",
    ground: [0.64, 0.34, 0.18],
    rock: 0x243345,
    wall: 0x334559,
    pale: 0x8ea4b3,
    accent: 0x51dbe8,
    vegetation: 0x3b6264,
    districts: [],
    approaches: [],
  },
  WHITEOUT: {
    biome: "polar",
    ground: [0.53, 0.4, 0.72],
    rock: 0x63abc1,
    wall: 0x235d83,
    pale: 0xe0f4f4,
    accent: 0xf47e35,
    vegetation: 0x648a99,
    districts: [
      { name: "ICE CORE OBSERVATORY", u: 0.315, side: -1, kind: "observatory" },
      { name: "BASIN SURVEY", u: 0.445, side: 1, kind: "survey" },
      { name: "VALLEY WEATHER STATION", u: 0.68, side: -1, kind: "weather" },
    ],
    approaches: [
      { name: "EXPEDITION STORES", u: 0.1, side: -1, kind: "cold-store" },
      { name: "GLACIAL ENTRY FACE", u: 0.28, side: 1, kind: "iceface" },
      { name: "BASIN BLUE ICE", u: 0.39, side: -1, kind: "iceface" },
      { name: "VALLEY CORE DEPOT", u: 0.62, side: -1, kind: "cold-store" },
      { name: "UPPER PASS RELAY", u: 0.9, side: -1, kind: "weather" },
      { name: "RIDGE ARRAY", u: 0.805, branch: -1, side: -1, kind: "weather" },
      { name: "BLUE ICE CUT", u: 0.8, branch: 1, side: 1, kind: "iceface" },
    ],
  },
  MONSOON: {
    biome: "hydraulic",
    ground: [0.34, 0.48, 0.34],
    rock: 0x4d8c73,
    wall: 0x397e7b,
    pale: 0xcce5d5,
    accent: 0xf1c845,
    vegetation: 0x258650,
    districts: [
      { name: "UPPER RESERVOIR", u: 0.21, side: 1, kind: "reservoir" },
      { name: "PUMP ISLAND", u: 0.44, side: 1, kind: "pump-island" },
      { name: "GARDEN INTAKE", u: 0.73, side: -1, kind: "terraces" },
    ],
    approaches: [
      { name: "HEADWATER GARDENS", u: 0.12, side: -1, kind: "terraces" },
      { name: "DESCENT PRESSURE WORKS", u: 0.245, side: 1, kind: "pipe-yard" },
      { name: "LOWER LOCK SERVICES", u: 0.5, side: 1, kind: "pumps" },
      { name: "HIGH INTAKE TERRACES", u: 0.88, side: 1, kind: "terraces" },
    ],
  },
  CINDERLINE: {
    biome: "volcanic",
    ground: [0.68, 0.24, 0.22],
    rock: 0x41405f,
    wall: 0x395d70,
    pale: 0xd3e3e9,
    accent: 0xe4d43e,
    vegetation: 0x8b8b56,
    districts: [
      { name: "CALDERA EXCHANGE", u: 0.23, side: -1, kind: "geothermal" },
      { name: "SULFUR CUT", u: 0.435, side: 1, kind: "basalt" },
      {
        name: "CONDENSER FIELD",
        u: 0.78,
        side: -1,
        branch: -1,
        kind: "condenser",
      },
    ],
    approaches: [
      { name: "RIDGE STEAM MAINS", u: 0.1, side: 1, kind: "pipe-yard" },
      { name: "COLUMNAR CUT", u: 0.31, side: -1, kind: "basalt" },
      { name: "LOWER CALDERA MAINS", u: 0.6, side: 1, kind: "pipe-yard" },
      { name: "RIM BASALT FACE", u: 0.675, side: -1, kind: "basalt" },
      {
        name: "LOWER BASALT CUT",
        u: 0.845,
        side: 1,
        branch: -1,
        kind: "basalt",
      },
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
  if (recipe.biome === "metropolis") {
    // City street datum: the elevated course is carried by real architecture,
    // never an earth berm raised into the rooftop skyline.
    return 12;
  }
  if (recipe.biome === "polar") {
    // Asymmetric enclosing ice ridges; the distant outer shelf drops to ocean.
    const basinRadius = Math.hypot(x / 530, z / 530);
    const rim = Math.exp(-(((basinRadius - 1) / 0.29) ** 2));
    const inland = 1 - Math.min(1, Math.max(0, (basinRadius - 1.3) / 0.65));
    const basin =
      -32 +
      inland * 77 +
      rim * (185 + 70 * Math.sin(x * 0.0041 + z * 0.0023) ** 2) +
      14 * Math.sin(x * 0.003 + z * 0.005);
    // One broad glacial shoulder carries the exposed ridge pass. The shared
    // road excavation cuts the lower branch into this same physical landform.
    const pass = Math.exp(-(((x - 1780) / 520) ** 4 + ((z - 1790) / 310) ** 4));
    return basin + (205 - basin) * pass;
  }
  if (recipe.biome === "hydraulic") {
    // Continuous rounded uplands: quantized heights made each lit grid cell
    // resemble a separate cube, rather than an authored agricultural terrace.
    return (
      32 +
      48 * Math.sin(x * 0.0018 - z * 0.0011) ** 2 +
      12 * Math.cos(z * 0.0024) +
      7 * Math.sin(x * 0.003 + z * 0.0018)
    );
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
