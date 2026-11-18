import * as THREE from "three";
import { celestialDirection, COURSE_LIGHTING } from "./course-lighting.ts";
import { EXPANSION_SKIES } from "./expansion-skies.ts";
import { vesperTower, vesperFacade } from "./vesper-sky.ts";

const TAU = Math.PI * 2;
const stories: Record<string, import("./expansion-skies.ts").SkyStory> = {
  ...EXPANSION_SKIES,
  "KAISEKI COAST": {
    dusk: 0xb6ccd0,
    cloud: 0xe0e5d5,
    ridge: 0x779cac,
    foreground: 0x507d8a,
    skyline: 0x648b92,
    far: [
      [0, 0.035],
      [0.06, 0.055],
      [0.13, 0.13],
      [0.19, 0.08],
      [0.25, 0.018],
      [0.34, 0.025],
      [0.41, 0.105],
      [0.46, 0.12],
      [0.52, 0.025],
      [0.63, 0.012],
      // Keep a low wide sea horizon ahead of the inlet flyover.
      [0.71, 0.043],
      [0.78, 0.015],
      [0.87, 0.009],
      [1, 0.035],
    ],
    near: [
      [0, 0],
      [0.12, 0],
      [0.17, 0.062],
      [0.21, 0.055],
      [0.26, 0],
      [0.43, 0],
      [0.48, 0.075],
      [0.53, 0.04],
      [0.57, 0],
      [0.7, 0],
      [0.76, 0.011],
      [0.82, 0],
      [0.87, 0],
      [1, 0],
    ],
    clouds: [
      [0.17, 0.15, 0.29, 0.032],
      [0.45, 0.12, 0.42, 0.025],
      [0.76, 0.2, 0.26, 0.04],
    ],
    cities: [
      [0.19, 0.245, 0.055, "terraces"],
      [0.5, 0.555, 0.07, "terraces"],
      [0.68, 0.73, 0.035, "terraces"],
    ],
  },
  "SOLAR ARRAY": {
    dusk: 0xd59e70,
    cloud: 0xe6b58f,
    ridge: 0xaa765d,
    foreground: 0x815948,
    skyline: 0x655455,
    far: [
      [0, 0.09],
      [0.06, 0.15],
      [0.13, 0.19],
      [0.19, 0.1],
      [0.25, 0.055],
      [0.32, 0.145],
      [0.39, 0.11],
      [0.46, 0.075],
      [0.54, 0.17],
      [0.61, 0.1],
      [0.68, 0.065],
      [0.77, 0.205],
      [0.84, 0.145],
      [0.92, 0.12],
      [1, 0.09],
    ],
    near: [
      [0, 0.055],
      [0.06, 0.055],
      [0.085, 0.105],
      [0.15, 0.105],
      [0.18, 0.045],
      [0.29, 0.035],
      [0.32, 0.08],
      [0.38, 0.08],
      [0.4, 0.03],
      [0.48, 0.03],
      [0.51, 0.095],
      [0.57, 0.095],
      [0.6, 0.025],
      [0.72, 0.025],
      [0.75, 0.13],
      [0.82, 0.13],
      [0.86, 0.055],
      [1, 0.055],
    ],
    clouds: [
      [0.08, 0.2, 0.3, 0.018],
      [0.4, 0.16, 0.38, 0.022],
      [0.73, 0.25, 0.28, 0.025],
    ],
    cities: [
      [0.24, 0.29, 0.068, "power"],
      [0.65, 0.69, 0.045, "power"],
    ],
  },
  NOCTILUCENT: {
    dusk: 0x354e66,
    cloud: 0x50627c,
    ridge: 0x263d5d,
    foreground: 0x151f34,
    skyline: 0x182a40,
    far: [
      [0, 0.045],
      [0.09, 0.09],
      [0.16, 0.12],
      [0.24, 0.045],
      [0.34, 0.025],
      [0.45, 0.065],
      [0.57, 0.14],
      [0.65, 0.085],
      [0.73, 0.03],
      [0.84, 0.055],
      [0.94, 0.025],
      [1, 0.045],
    ],
    near: [
      [0, 0.02],
      [0.13, 0.02],
      [0.21, 0.055],
      [0.28, 0.035],
      [0.36, 0.018],
      [0.49, 0.018],
      [0.56, 0.075],
      [0.62, 0.055],
      [0.7, 0.018],
      [0.89, 0.018],
      [0.95, 0.04],
      [1, 0.02],
    ],
    clouds: [
      [0.12, 0.15, 0.28, 0.03],
      [0.43, 0.2, 0.4, 0.04],
      [0.81, 0.14, 0.24, 0.035],
    ],
    cities: [
      [0.035, 0.14, 0.105, "towers"],
      [0.28, 0.38, 0.07, "docks"],
      [0.43, 0.51, 0.15, "towers"],
      [0.67, 0.755, 0.085, "docks"],
      [0.83, 0.92, 0.11, "towers"],
    ],
  },
};

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const blend = (a: number[], b: number[], t: number) =>
  a.map((v: number, i: number) => v + (b[i] - v) * t);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const distance = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function profile(knots: [number, number][], u: number, rounded: boolean) {
  const i = knots.findIndex((k) => k[0] >= u);
  if (i === 0) return knots[0][1];
  const a = knots[i - 1],
    b = knots[i];
  const t = (u - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * (rounded ? t * t * (3 - 2 * t) : t);
}

function cityAt(groups: [number, number, number, string][], u: number) {
  for (const [district, [start, end, height, kind]] of groups.entries()) {
    if (u < start || u >= end) continue;
    const p = (u - start) / (end - start);
    if (kind === "metropolis") {
      const tower = vesperTower(p, district);
      return { ...tower, height: height * tower.height, kind, p };
    }
    if (kind === "terraces") {
      const roofs = [0.34, 0.52, 0.68, 0.5, 0.92, 1, 0.8, 0.53, 0.31];
      return { height: height * roofs[Math.floor(p * roofs.length)], kind, p };
    }
    if (kind === "power") {
      const ribs = Math.floor(p * 15);
      return {
        height:
          height * (ribs === 4 || ribs === 11 ? 1 : ribs % 3 ? 0.25 : 0.55),
        kind,
        p,
      };
    }
    if (kind === "docks") {
      const span = p * 5,
        bay = span % 1;
      const mast = bay > 0.15 && bay < 0.29;
      const jib = bay > 0.2 && bay < 0.79;
      const rise = mast ? 1 : jib ? 0.89 - (bay - 0.29) * 0.42 : 0.2;
      return { height: height * rise, kind, p };
    }
    if (kind === "observatory") {
      const bay = (p * 3) % 1;
      const dome = Math.sqrt(Math.max(0, 1 - ((bay - 0.5) / 0.38) ** 2));
      return {
        height:
          height * (0.22 + dome * 0.6 + (bay > 0.47 && bay < 0.51 ? 0.18 : 0)),
        kind,
        p,
      };
    }
    if (kind === "works") {
      const bay = (p * 4) % 1;
      return {
        height: height * (bay < 0.13 ? 1 : bay < 0.8 ? 0.35 : 0.16),
        kind,
        p,
      };
    }
    const blocks = [
      0.35, 0.55, 0.47, 0.76, 0.5, 1, 0.9, 0.43, 0.68, 0.38, 0.26,
    ];
    return { height: height * blocks[Math.floor(p * blocks.length)], kind, p };
  }
  return null;
}

/** Original full-sphere matte painting; rows run south-to-north for DataTexture. */
export function paintSky(
  config: { name: string; biome?: string; sky: THREE.ColorRepresentation },
  fogHex: number,
  width = 1024,
  height = 512,
) {
  const story = stories[config.name],
    night = config.name === "NOCTILUCENT" || config.biome === "metropolis";
  const fog = rgb(fogHex),
    dusk = rgb(story.dusk),
    clouds = rgb(story.cloud);
  const zenith = rgb(new THREE.Color(config.sky).multiplyScalar(0.65).getHex());
  const farColor = rgb(story.ridge),
    nearColor = rgb(story.foreground),
    cityColor = rgb(story.skyline);
  const [glowColor, glowStrength] = COURSE_LIGHTING[config.name].skyGlow;
  const snowColor = story.snow ? rgb(story.snow) : null;
  const plumeColor = story.plume ? rgb(story.plume.color) : null;
  const sun = celestialDirection(config.name);
  const sunAngle = Math.atan2(sun.z, sun.x),
    sunHeight = Math.asin(sun.y);
  const data = new Uint8Array(width * height * 4);
  // Approximate silhouette coverage over a latitude texel. Hard row cutoffs turn
  // shallow distant ridges into long stair steps even with linear GPU filtering.
  const halfTexel = Math.PI / (height - 1) / 2;
  const coverage = (edge: number, latitude: number) =>
    1 - smooth(edge - halfTexel, edge + halfTexel, latitude);
  const rows = Array.from({ length: height }, (_, y) => {
    const latitude = (y / (height - 1) - 0.5) * Math.PI;
    const color =
      latitude <= 0
        ? fog
        : latitude < 0.13
          ? blend(fog, dusk, smooth(0, 0.13, latitude))
          : blend(dusk, zenith, smooth(0.13, 1.2, latitude));
    return { latitude, color };
  });
  for (let x = 0; x < width; x++) {
    const u = x / (width - 1),
      angle = (u - 0.5) * TAU;
    const sunDistance = distance(angle, sunAngle);
    // The existing depth-tested celestial body stays in a clear sky pocket.
    // Painted mountains cannot pretend to occlude a foreground sun/moon mesh.
    const pocket = 1 - smooth(0.13, 0.32, sunDistance);
    const limit = sunHeight - 0.075;
    const farHeight = Math.min(
      profile(story.far, u, story.ridgeStyle !== "angular"),
      0.3 * (1 - pocket) + limit * pocket,
    );
    const nearHeight = Math.min(
      profile(story.near, u, false),
      0.3 * (1 - pocket) + limit * pocket,
    );
    const city = cityAt(story.cities, u);
    const cityHeight = city
      ? Math.min(city.height, 0.3 * (1 - pocket) + limit * pocket)
      : 0;
    const cloudBands = story.clouds
      .map(([center, spread, altitude, thickness]) => {
        const d = distance(angle, (center - 0.5) * TAU) / (spread * TAU);
        const body = clamp(1 - d * d);
        return {
          middle: altitude + 0.014 * Math.sin(angle * 5 + center * 9),
          half: thickness * body * (0.85 + 0.15 * Math.sin(angle * 19)),
          opacity: body * 0.52,
        };
      })
      .filter((cloud) => cloud.half > 0);
    for (let y = 0; y < height; y++) {
      const { latitude, color } = rows[y];
      let pixel = color;
      if (latitude > 0) {
        const glow =
          Math.exp(
            -((sunDistance / 0.65) ** 2 + ((latitude - sunHeight) / 0.2) ** 2),
          ) * glowStrength;
        if (glow) pixel = blend(pixel, glowColor, glow);
        if (
          story.plume &&
          latitude > story.plume.base &&
          latitude < story.plume.top
        ) {
          const h =
            (latitude - story.plume.base) /
            (story.plume.top - story.plume.base);
          const center = story.plume.bearing + h * story.plume.drift;
          const span = story.plume.width * (0.2 + h * 1.5);
          const d = distance(angle, (center - 0.5) * TAU) / (span * TAU);
          if (d < 1)
            pixel = blend(
              pixel,
              plumeColor!,
              (1 - d * d) * Math.sin(h * Math.PI) * 0.32,
            );
        }
        for (const cloud of cloudBands) {
          const edge = Math.abs(latitude - cloud.middle) / cloud.half;
          const clearMoon =
            pocket * (1 - smooth(0.1, 0.24, Math.abs(latitude - sunHeight)));
          if (edge < 1)
            pixel = blend(
              pixel,
              clouds,
              cloud.opacity * (1 - smooth(0.65, 1, edge)) * (1 - clearMoon),
            );
        }
        const haze = smooth(0.002, 0.055, latitude);
        const farCoverage = coverage(farHeight, latitude);
        if (farCoverage > 0) {
          const ridgeColor = snowColor
            ? blend(
                farColor,
                snowColor,
                smooth(farHeight * 0.6, farHeight * 0.9, latitude) * 0.7,
              )
            : farColor;
          pixel = blend(pixel, ridgeColor, haze * 0.82 * farCoverage);
        }
        const nearCoverage = coverage(nearHeight, latitude);
        if (nearCoverage > 0) {
          const bedding =
            config.name === "SOLAR ARRAY" && latitude > nearHeight * 0.68
              ? 0.12
              : 0;
          pixel = blend(
            pixel,
            blend(nearColor, farColor, bedding),
            haze * nearCoverage,
          );
        }
        const cityCoverage = coverage(cityHeight, latitude);
        if (city && cityCoverage > 0) {
          const facade =
            city.kind === "metropolis"
              ? vesperFacade(
                  city as ReturnType<typeof vesperTower>,
                  latitude,
                  cityHeight,
                )
              : cityColor;
          pixel = blend(pixel, facade, haze * cityCoverage);
          // Long harbour beacons trace the working roofs and crane jibs. The
          // unlit gaps define the shape without a field of sparkling pixels.
          if (night && (city.kind === "docks" || city.kind === "towers")) {
            const bay = (city.p * (city.kind === "docks" ? 5 : 11)) % 1;
            const lit =
              city.kind === "docks"
                ? bay > 0.23 && bay < 0.75
                : bay > 0.16 && bay < 0.84;
            const trim = cityHeight - latitude;
            if (lit && trim < 0.018)
              pixel = blend(
                pixel,
                city.kind === "docks" ? [136, 184, 181] : [103, 146, 165],
                0.74 * (1 - smooth(0.006, 0.018, trim)) * haze * cityCoverage,
              );
          }
        }
      }
      const offset = (y * width + x) * 4;
      data[offset] = Math.round(pixel[0]);
      data[offset + 1] = Math.round(pixel[1]);
      data[offset + 2] = Math.round(pixel[2]);
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

/** One static, world-oriented sky; no extra scenery meshes or per-frame work. */
export function createSky(
  config: { name: string; biome?: string; sky: THREE.ColorRepresentation },
  fogHex: number,
  prepared?: ReturnType<typeof paintSky>,
) {
  // One active course at a time: every painting shares the same budget.
  // LOW RES controls the scene framebuffer, not a second coarse horizon source.
  const image = prepared ?? paintSky(config, fogHex, 2048, 1024);
  const texture = new THREE.DataTexture(image.data, image.width, image.height);
  texture.name = `${config.name} distant world`;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
