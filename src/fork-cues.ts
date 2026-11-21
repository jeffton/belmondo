import * as THREE from "three";
import { roadFrame, type RoadSurfaceFrame } from "./road-surface.ts";
import type { Track } from "./track.ts";

export function forkCueLayout(track: Track, stations: readonly number[]) {
  const [start, end] = track.config.split;
  if (start < 0) return null;
  // Use the same interval as the first rendered inner rail, including the
  // last connected cross-section used by its tapered tip.
  const tip =
    stations.find(
      (u, i) =>
        u >= start &&
        u < end &&
        !roadFrame(track, stations[i + 1] * track.length, -1).connected,
    )! * track.length;
  return { tip, approach: tip - 265, exit: tip + 72 };
}

/** Signed distance from the real join, or from each carriageway's inner edge. */
export function forkCueDistance(frame: RoadSurfaceFrame, point: THREE.Vector3) {
  const origin = frame.seam ?? frame.p;
  const lateral =
    (point.x - origin.x) * frame.right.x +
    (point.y - origin.y) * frame.right.y +
    (point.z - origin.z) * frame.right.z;
  if (frame.seam || !frame.branch) return lateral;
  const edge = frame.innerSide < 0 ? frame.clipMin : frame.clipMax;
  return lateral - edge;
}

/** A painted median nose, baked into the existing road draw, not a decal mesh. */
export function applyForkCues(
  material: THREE.Material,
  { approach, tip, exit }: NonNullable<ReturnType<typeof forkCueLayout>>,
) {
  const previous = material.onBeforeCompile.bind(material);
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${cacheKey}:split-median`;
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.forkCueWindow = {
      value: new THREE.Vector3(approach, tip, exit),
    };
    shader.uniforms.forkCuePaint = { value: new THREE.Color(0xffdb9f) };
    shader.vertexShader = `
      attribute float forkCueDistance;
      varying vec2 vForkCue;
      ${shader.vertexShader}`.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\nvForkCue = vec2(forkCueDistance, uv.y * 32.0);",
    );
    shader.fragmentShader = `
      varying vec2 vForkCue;
      uniform vec3 forkCueWindow;
      uniform vec3 forkCuePaint;
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `
        // Integrate across the fragment so paint holds up on the LOWRES grid.
        vec2 footprint = max(fwidth(vForkCue), vec2(0.001));
        if (vForkCue.y >= forkCueWindow.x && vForkCue.y <= forkCueWindow.z) {
          float medianX = abs(vForkCue.x);
          float toNose = forkCueWindow.y - vForkCue.y;
          float runout = 1.0 - smoothstep(forkCueWindow.y, forkCueWindow.z, vForkCue.y);
          float swell = 1.0 - smoothstep(0.0, 94.0, toNose);
          float lining = mix(0.15, 2.9, swell) * mix(0.28, 1.0, runout);
          float halfPaint = mix(0.32, 0.64, swell);
          float core = clamp((lining + halfPaint - medianX) / footprint.x + 0.5, 0.0, 1.0);
          float paint = core - clamp((lining - halfPaint - medianX) / footprint.x + 0.5, 0.0, 1.0);
          float reveal = swell * runout;

          // Two outward-swept pairs announce the two lanes even when the
          // player's hull or a crest hides the actual tip of the median.
          float inlays = 0.0;
          for (int i = 0; i < 2; i++) {
            float pair = float(i);
            float along = (208.0 - pair * 86.0) - toNose;
            float length = 16.0 + pair * 3.0;
            float slope = 0.20 + pair * 0.03;
            float diagonal = abs(medianX - (4.2 + pair * 1.20 + along * slope));
            float projectedPixel = footprint.x + slope * footprint.y;
            float flanks = clamp((0.85 - diagonal) / projectedPixel + 0.5, 0.0, 1.0);
            float ends = clamp((length - abs(along)) / footprint.y + 0.5, 0.0, 1.0);
            inlays = max(inlays, flanks * ends);
          }
          diffuseColor.rgb *= 1.0 - 0.64 * core * reveal;
          diffuseColor.rgb = mix(diffuseColor.rgb, forkCuePaint, max(0.90 * paint * reveal, 0.88 * inlays));
        }
        #include <color_fragment>
      `,
    );
  };
}
