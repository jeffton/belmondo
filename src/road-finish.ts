import * as THREE from "three";

// Wide, low-intensity highlights distinguish sealed wet decks from diffuse
// mineral surfaces. No reflection pass, new texture, noise or moving overlay.
export const ROAD_FINISH = {
  "PALM BREAKER": { specular: 0x252630, shininess: 7 },
  "VESPER CIRCUIT": { specular: 0x344753, shininess: 11 },
  MONSOON: { specular: 0x354448, shininess: 8 },
  NOCTILUCENT: { specular: 0x304456, shininess: 10 },
  "SOLAR ARRAY": null,
  FAULTLINE: null,
  WHITEOUT: null,
  CINDERLINE: null,
} as const;

/** Jump pigment is composed by the caller on this material, before lighting. */
export function createRoadFinish(course: string, map: THREE.Texture) {
  const finish = ROAD_FINISH[course as keyof typeof ROAD_FINISH];
  const options = {
    vertexColors: true,
    map,
    side: THREE.DoubleSide,
    flatShading: true,
  };
  return finish === null
    ? new THREE.MeshLambertMaterial(options)
    : new THREE.MeshPhongMaterial({ ...options, ...finish });
}
