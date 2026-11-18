// Homologated numbers and shapes, shared by the livery print, paddock, timing
// gantry and classified results. Index is the stable craft variant, not UI order.
export const LEAGUE_TEAMS = [
  {
    code: "VX",
    number: "01",
    name: "VEX",
    color: "#ff825d",
    ink: "#251b25",
    paths: ["2,3 9,3 17,14 22,8 29,8 17,24"],
  },
  {
    code: "LX",
    number: "27",
    name: "LUX",
    color: "#a6e7cb",
    ink: "#17342e",
    paths: ["13,2 25,2 12,24 2,24", "24,11 30,11 23,24 17,24"],
  },
  {
    code: "PH",
    number: "44",
    name: "PHASE",
    color: "#c5aff9",
    ink: "#242036",
    paths: ["2,4 28,4 25,10 5,10", "7,13 23,13 16,24 13,24"],
  },
] as const;

export function teamEmblem(index: number) {
  const { paths } = LEAGUE_TEAMS[index];
  return `<svg class="team-emblem" viewBox="0 0 32 26" aria-hidden="true" focusable="false">${paths.map((points) => `<polygon points="${points}"/>`).join("")}</svg>`;
}

export function paintTeamEmblem(
  ctx: CanvasRenderingContext2D,
  index: number,
  x: number,
  y: number,
  scale: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const outline of LEAGUE_TEAMS[index].paths) {
    const points = outline
      .split(" ")
      .map((pair) => pair.split(",").map(Number));
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
