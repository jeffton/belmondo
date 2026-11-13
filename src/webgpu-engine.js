import {
  Renderer,
  StandardNodeLibrary,
  WebGPUBackend,
  SRGBColorSpace,
} from "three/webgpu";
import {
  instanceIndex,
  positionGeometry,
  referenceAttribute,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { LensflareMesh } from "three/addons/objects/LensflareMesh.js";

/** Keep the WebGL crowd's instanced cheer, including its instance-local phase. */
export class BelmondoNodeLibrary extends StandardNodeLibrary {
  fromMaterial(material) {
    const nodeMaterial = super.fromMaterial(material);
    const crowdTime = material.userData.finishCrowdTime;
    if (crowdTime) {
      const elapsed = uniform(0).onRenderUpdate(() => crowdTime.value);
      const cheer = elapsed
        .mul(2.7)
        .add(instanceIndex.toFloat().mul(2.399))
        .sin()
        .mul(positionGeometry.y.sub(0.35).max(0));
      // positionNode is evaluated after Three's instancing stage. Reapply the
      // instance matrix to the deformed geometry, exactly as WebGL's vertex
      // shader does; assigning geometry here would collapse the crowd instances.
      nodeMaterial.positionNode = referenceAttribute("instanceMatrix", "mat4")
        .mul(vec4(positionGeometry.add(vec3(cheer.mul(0.12), cheer.mul(0.045), 0)), 1))
        .xyz;
    }
    return nodeMaterial;
  }
}

/** Public r187 backend API: no WebGL backend is installed or attempted. */
export async function createWebGPURenderer(parameters) {
  if (!globalThis.navigator?.gpu)
    throw new Error(
      "WebGPU is unavailable in this browser. Safari requires iOS 26 or later.",
    );
  const renderer = new Renderer(new WebGPUBackend(parameters), parameters);
  renderer.library = new BelmondoNodeLibrary();
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend)
    throw new Error(
      "The selected renderer did not initialize a WebGPU backend.",
    );
  renderer.outputColorSpace = SRGBColorSpace;
  return renderer;
}

export function createWebGPULensflare() {
  const flare = new LensflareMesh();
  const addElement = flare.addElement;
  // LensflareMesh converts input colors from sRGB at first render, unlike
  // WebGL's Lensflare. Supply encoded clones, so both shaders receive the same
  // linear colors and the caller-owned elements are not mutated.
  flare.addElement = (element) => addElement({
    ...element,
    color: element.color.clone().convertLinearToSRGB(),
  });
  return flare;
}

export async function createWebGPUEngine(canvas) {
  const worldRenderer = await createWebGPURenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  let previewRenderer;
  try {
    previewRenderer = await createWebGPURenderer({
      alpha: true,
      antialias: true,
      device: worldRenderer.backend.device,
    });
  } catch (error) {
    await worldRenderer.dispose();
    throw error;
  }
  previewRenderer.setClearColor(0x000000, 0);
  return {
    worldRenderer,
    previewRenderer,
    createLensflare: createWebGPULensflare,
  };
}
