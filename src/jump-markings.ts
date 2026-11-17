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
  const landing =
    (track.config.jump + track.config.gapLength!) * track.length + 0.000001;
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
      start: offsetAlongDeck(track, anchor, distance - length / 2),
      end: offsetAlongDeck(track, anchor, distance + length / 2),
    });
  }
  // Full-width red asphalt meets each physical gap edge. These short road
  // sections share one pigment, without thresholds, shoulder trim or symbols.
  patch("approach", launch, -32, -1, 1, 64, 0xe84228);
  patch("landing", landing, 22, -1, 1, 44, 0xe84228);
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
  const window = new THREE.Vector2(
    Math.min(...layout.map((patch) => patch.start)),
    Math.max(...layout.map((patch) => patch.end)),
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.jumpRectangles = { value: rectangles };
    shader.uniforms.jumpColors = { value: colors };
    // Translucent pigment leaves the existing asphalt map visible underneath.
    shader.uniforms.jumpPaintOpacity = { value: 0.6 };
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
      uniform float jumpPaintOpacity;
      uniform vec2 jumpWindow;
      float jumpCoverage(vec2 point, vec4 rectangle, vec2 footprint) {
        vec2 low = vec2(rectangle.x, rectangle.z);
        vec2 high = vec2(rectangle.y, rectangle.w);
        vec2 coverage = clamp((point - low) / footprint + 0.5, 0.0, 1.0)
                      - clamp((point - high) / footprint + 0.5, 0.0, 1.0);
        return coverage.x * coverage.y;
      }
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `
        // Derivatives must be evaluated outside the non-uniform range branch.
        // The epsilon only protects a numerically zero derivative; it is not LOD.
        vec2 jumpFootprint = max(fwidth(vJumpDeck), vec2(0.00001));
        if (vJumpDeck.y + jumpFootprint.y * 0.5 >= jumpWindow.x &&
            vJumpDeck.y - jumpFootprint.y * 0.5 <= jumpWindow.y) {
          float jumpInk = 0.0;
          vec3 jumpColor = vec3(0.0);
          for (int i = 0; i < ${layout.length}; i++) {
            float coverage = jumpCoverage(vJumpDeck, jumpRectangles[i], jumpFootprint);
            jumpInk += coverage;
            jumpColor += jumpColors[i] * coverage;
          }
          if (jumpInk > 0.0)
            diffuseColor.rgb = mix(diffuseColor.rgb, jumpColor / jumpInk,
                                   min(jumpInk, 1.0) * jumpPaintOpacity);
        }
        // Paint and asphalt share the road's vertex shading, lighting and shadows.
        #include <color_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => "jump-red-asphalt-v3";
  return { layout, rectangles, colors, window };
}
