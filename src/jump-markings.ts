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
  // The connected launch apron leads to the physical lip, not a sequence of
  // floating countdown stamps. No arrows, chips or thin trim lines.
  for (const side of [-1, 1])
    patch(
      "approach",
      launch,
      -80,
      side < 0 ? -0.9 : 0.6,
      side < 0 ? -0.6 : 0.9,
      96,
      0xe84228,
    );
  patch("approach", launch, -22, -0.9, 0.9, 20, 0xe84228);
  patch("approach", launch, -7, -0.9, 0.9, 10, 0xffedd2);
  // Oxide-finished receiving shoulders meet the existing 1.65m service edge.
  // They are a material change at the lip, not a stripe across the racing deck.
  const outer = 1 - 1.65 / track.frame(landing).width;
  for (const side of [-1, 1])
    patch(
      "landing",
      landing,
      16,
      side < 0 ? -outer : outer - 0.2,
      side < 0 ? -(outer - 0.2) : outer,
      28,
      new THREE.Color(3.6, 0.85, 0.45),
    );
  return patches;
}

/**
 * Ink is composited into the existing road, not laid over it as more geometry.
 * Integrating each rectangle over the fragment footprint keeps distant marks
 * fractional instead of blinking on/off on the non-MSAA LOWRES pixel grid.
 */
export function applyJumpMarkings(material: THREE.Material, track: Track) {
  const layout = getJumpMarkingLayout(track);
  if (!layout.length) return null;
  const rectangles = layout.map((patch) => {
    const width = track.frame(patch.station).width;
    return new THREE.Vector4(
      patch.left * width,
      patch.right * width,
      patch.start,
      patch.end,
    );
  });
  const colors = layout.map((patch) => new THREE.Color(patch.color));
  const asphalt = layout.map((patch) => Number(patch.kind === "landing"));
  const window = new THREE.Vector2(
    Math.min(...layout.map((patch) => patch.start)),
    Math.max(...layout.map((patch) => patch.end)),
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.jumpRectangles = { value: rectangles };
    shader.uniforms.jumpColors = { value: colors };
    shader.uniforms.jumpAsphalt = { value: asphalt };
    shader.uniforms.jumpWindow = { value: window };
    shader.vertexShader =
      `varying vec2 vJumpDeck;\n${shader.vertexShader}`.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvJumpDeck = uv * 32.0;",
      );
    shader.fragmentShader = `
      varying vec2 vJumpDeck;
      uniform vec4 jumpRectangles[${layout.length}];
      uniform vec3 jumpColors[${layout.length}];
      uniform float jumpAsphalt[${layout.length}];
      uniform vec2 jumpWindow;
      float jumpCoverage(vec2 point, vec4 rectangle, vec2 footprint) {
        vec2 low = vec2(rectangle.x, rectangle.z);
        vec2 high = vec2(rectangle.y, rectangle.w);
        vec2 coverage = clamp((point - low) / footprint + 0.5, 0.0, 1.0)
                      - clamp((point - high) / footprint + 0.5, 0.0, 1.0);
        return coverage.x * coverage.y;
      }
      ${shader.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `
        // Derivatives must be evaluated outside the non-uniform range branch.
        // The epsilon only protects a numerically zero derivative; it is not LOD.
        vec2 jumpFootprint = max(fwidth(vJumpDeck), vec2(0.00001));
        if (vJumpDeck.y + jumpFootprint.y * 0.5 >= jumpWindow.x &&
            vJumpDeck.y - jumpFootprint.y * 0.5 <= jumpWindow.y) {
          float jumpInk = 0.0;
          vec3 jumpColor = vec3(0.0);
          float asphaltLight = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
          for (int i = 0; i < ${layout.length}; i++) {
            float coverage = jumpCoverage(vJumpDeck, jumpRectangles[i], jumpFootprint);
            jumpInk += coverage;
            // Pigment follows the lit asphalt's grain and light/shade, rather
            // than replacing it with a blank uniformly coloured rectangle.
            vec3 finish = mix(jumpColors[i], asphaltLight * jumpColors[i], jumpAsphalt[i]);
            jumpColor += finish * coverage;
          }
          if (jumpInk > 0.0)
            outgoingLight = mix(outgoingLight, jumpColor / jumpInk, min(jumpInk, 1.0));
        }
        #include <opaque_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => "jump-apron-coverage-v1";
  return { layout, rectangles, colors, asphalt, window };
}
