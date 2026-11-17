import type { Track } from "./track.ts";
import * as THREE from "three";

/** Walk real deck metres, including ramp slope, without crossing the missing deck. */
export function offsetAlongDeck(track: Track, station: number, metres: number) {
  let remaining = Math.abs(metres);
  const direction = Math.sign(metres);
  while (remaining > 0) {
    const next = station + direction * 2;
    const distance = track.frame(station).p.distanceTo(track.frame(next).p);
    if (distance >= remaining)
      return station + (direction * 2 * remaining) / distance;
    station = next;
    remaining -= distance;
  }
  return station;
}

export function getJumpMarkingLayout(track: Track) {
  if (track.config.jump === null) return [];
  const launch = track.config.jump * track.length - 0.000001;
  const landing = (track.config.jump + track.config.gapLength!) * track.length;
  const patches: {
    kind: string;
    distance: number;
    anchor: number;
    station: number;
    left: number;
    right: number;
    color: THREE.ColorRepresentation;
    start: number;
    end: number;
  }[] = [];
  function patch(
    kind: string,
    anchor: number,
    distance: number,
    left: number,
    right: number,
    length: number,
    color: THREE.ColorRepresentation,
  ) {
    const station = offsetAlongDeck(track, anchor, distance);
    patches.push({
      kind,
      distance,
      anchor,
      station,
      left,
      right,
      color,
      start: offsetAlongDeck(track, station, -length / 2),
      end: offsetAlongDeck(track, station, length / 2),
    });
  }
  // Split staples, not arrows: three broad vermilion mouths count down to
  // takeoff. Ivory endcaps and long outer prongs survive low-res foreshortening.
  // The uninterrupted dark centre is a racing line, never a pickup socket.
  const vermilion = 0xef482d;
  const ivory = 0xfff1d7;
  function pair(
    kind: string,
    anchor: number,
    distance: number,
    inner: number,
    outer: number,
    length: number,
    color: THREE.ColorRepresentation,
  ) {
    for (const side of [-1, 1])
      patch(
        kind,
        anchor,
        distance,
        side < 0 ? -outer : inner,
        side < 0 ? -inner : outer,
        length,
        color,
      );
  }
  for (const distance of [-168, -100, -32]) {
    pair("approach", launch, distance, 0.24, 0.9, 13, vermilion);
    pair("approach", launch, distance - 10, 0.24, 0.9, 5, ivory);
    pair("approach", launch, distance + 17, 0.72, 0.9, 19, vermilion);
  }
  // One long receiving cradle reverses the launch motif: a wide threshold,
  // then receding shoulder arms. It reads from the air without painting the void.
  pair("landing", landing, 14, 0.24, 0.9, 18, vermilion);
  pair("landing", landing, 27, 0.24, 0.7, 6, ivory);
  pair("landing", landing, 59, 0.72, 0.9, 70, vermilion);
  pair("landing", landing, 64, 0.64, 0.7, 64, ivory);
  return patches;
}

function paintTexture() {
  const pixels = new Uint8Array(64 * 32 * 4);
  let seed = 7901;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const grain = 240 + (seed % 16);
    pixels.set([grain, grain, grain, seed % 101 < 4 ? 0 : 255], i);
  }
  const texture = new THREE.DataTexture(pixels, 64, 32);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Flat reflective ink: no collider, pad, arrow, light or bloom. */
export function buildJumpMarkings(
  scene: THREE.Object3D,
  track: Track,
  lighting: {
    shade(point: THREE.Vector3, color: THREE.ColorRepresentation): number;
  },
) {
  if (track.config.jump === null) return { mesh: null, layout: [] };
  const positions = [],
    colors = [],
    uv = [];
  const layout = getJumpMarkingLayout(track);
  for (const patch of layout) {
    // Follow the ramp/banking rather than stretching a plane through the deck.
    // Five-metre slices match the road renderer's longitudinal resolution.
    const slices = Math.ceil((patch.end - patch.start) / 5);
    for (let slice = 0; slice < slices; slice++) {
      const start = THREE.MathUtils.lerp(
        patch.start,
        patch.end,
        slice / slices,
      );
      const end = THREE.MathUtils.lerp(
        patch.start,
        patch.end,
        (slice + 1) / slices,
      );
      const a = track.frame(start),
        b = track.frame(end);
      const points = [
        a.p.clone().addScaledVector(a.right, patch.left * a.width),
        a.p.clone().addScaledVector(a.right, patch.right * a.width),
        b.p.clone().addScaledVector(b.right, patch.right * b.width),
        b.p.clone().addScaledVector(b.right, patch.left * b.width),
      ];
      for (const index of [0, 2, 1, 0, 3, 2]) {
        const p = points[index]
            .clone()
            .addScaledVector(index < 2 ? a.up : b.up, 0.04),
          tint = new THREE.Color(lighting.shade(p, patch.color));
        positions.push(...p.toArray());
        colors.push(tint.r, tint.g, tint.b);
        uv.push(
          (index === 0 || index === 3 ? patch.left : patch.right) * a.width,
          index < 2 ? start : end,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map: paintTexture(),
    alphaTest: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "jump-road-markings";
  scene.add(mesh);
  return { mesh, layout };
}
