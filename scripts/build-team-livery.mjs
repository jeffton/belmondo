// Regenerate the single runtime atlas from the original mechanical panel
// raster and the same silhouettes that appear on the paddock and start grid.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LEAGUE_TEAMS } from "../src/league-teams.ts";

const art = fileURLToPath(new URL("../public/art/", import.meta.url));
const paper = "#f0ebd7";
const rect = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const poly = (points, fill) => `<polygon points="${points}" fill="${fill}"/>`;

const prints = LEAGUE_TEAMS.map(({ color, ink, paths }, i) => {
  const emblem = (x, y, scale, fill) =>
    `<g transform="translate(${x} ${y}) scale(${scale})">${paths.map((p) => poly(p, fill)).join("")}</g>`;
  const deck = [
    rect(0, 0, 256, 256, i === 2 ? paper : ink),
    i === 0
      ? poly("0,117 141,88 214,256 0,256", color)
      : i === 1
        ? poly("92,0 157,0 194,256 73,256", paper)
        : poly("158,0 256,0 256,256 102,256", color),
    i === 0
      ? poly("141,88 177,82 256,256 214,256", paper)
      : i === 1
        ? rect(106, 0, 43, 256, color)
        : poly("150,0 158,0 102,256 93,256", ink),
    emblem(i === 0 ? 77 : i === 1 ? 81 : 109, 177, 2.8, ink),
  ];
  // Each print sits inside that airframe's wing UV polygon, not a shared
  // imaginary rectangle. Leave space from the panel edges for mip filtering.
  const [x, y, size] = [
    [34, 116, 5],
    [112, 80, 3],
    [18, 134, 3.25],
  ][i];
  const wing = [
    rect(0, 0, 256, 256, i === 2 ? paper : color),
    i === 0
      ? poly("0,0 111,0 193,116 0,103", paper)
      : i === 1
        ? poly("0,0 256,0 256,65 0,100", paper)
        : poly("0,188 256,134 256,256 0,256", color),
    emblem(x, y, size, ink),
  ];
  return `<g transform="translate(${i * 256} 0)">${deck.join("")}</g><g transform="translate(${i * 256} 256)">${wing.join("")}</g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512" width="1024" height="512">${prints}</svg>`;
execFileSync(
  "magick",
  [
    "-background",
    "#141e28",
    "+antialias",
    "svg:-",
    art + "craft-livery.png",
    "+swap",
    "-append",
    "-strip",
    "PNG24:" + art + "craft-league-atlas.png",
  ],
  { input: svg },
);
