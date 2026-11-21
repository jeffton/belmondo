import * as THREE from "three";
import { offsetAlongDeck, RED_ASPHALT } from "./jump-markings.ts";
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
  return {
    approach: offsetAlongDeck(track, tip, -190),
    tip,
    runout: tip + 62,
    halfWidth: 4.9,
  };
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

/** One tapered wedge, composited into the banked road’s own draw. */
export function applyForkCues(
  material: THREE.Material,
  {
    approach,
    tip,
    runout,
    halfWidth,
  }: NonNullable<ReturnType<typeof forkCueLayout>>,
) {
  const previous = material.onBeforeCompile.bind(material);
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${cacheKey}:split-red-wedge-runout`;
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.forkCueWindow = {
      value: new THREE.Vector4(approach, tip, runout, halfWidth),
    };
    shader.uniforms.forkCuePaint = {
      value: new THREE.Color(RED_ASPHALT.color),
    };
    shader.uniforms.forkCueOpacity = { value: RED_ASPHALT.opacity };
    shader.vertexShader = `
      attribute float forkCueDistance;
      varying vec2 vForkCue;
      ${shader.vertexShader}`.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\nvForkCue = vec2(forkCueDistance, uv.y * 32.0);",
    );
    shader.fragmentShader = `
      varying vec2 vForkCue;
      uniform vec4 forkCueWindow;
      uniform vec3 forkCuePaint;
      uniform float forkCueOpacity;
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `
        // Integrate across both sloped edges for the LOWRES pixel grid.
        float approachSlope = forkCueWindow.w / (forkCueWindow.y - forkCueWindow.x);
        float runoutSlope = forkCueWindow.w / (forkCueWindow.z - forkCueWindow.y);
        // Beyond the seam, zero lateral distance follows each route's inner edge.
        // The pigment stays constant while the painted area narrows to a point.
        float width = min((vForkCue.y - forkCueWindow.x) * approachSlope,
                          (forkCueWindow.z - vForkCue.y) * runoutSlope);
        vec2 footprint = max(fwidth(vec2(vForkCue.x, width)), vec2(0.00001));
        if (width > 0.0) {
          float across = footprint.x + footprint.y;
          float ink = clamp((width - vForkCue.x) / across + 0.5, 0.0, 1.0)
                    - clamp((-width - vForkCue.x) / across + 0.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, forkCuePaint, ink * forkCueOpacity);
        }
        #include <color_fragment>
      `,
    );
  };
}
