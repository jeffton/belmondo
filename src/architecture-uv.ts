import * as THREE from "three";

export type ArchitectureMap =
  "concrete" | "facade" | "paint" | "water" | "rock";

// One complete atlas repeat in metres. Concrete has 2×4 cast bays; facade
// has 2×4 glazing bays. Their proportions remain stable on every box face.
export const ARCHITECTURE_TILE_METRES: Record<
  ArchitectureMap,
  [number, number]
> = {
  concrete: [16, 32],
  facade: [12, 24],
  paint: [12, 12],
  water: [32, 32],
  rock: [32, 64],
};

/** BoxGeometry's face UVs retain their orientation; only physical scale changes. */
export function scaleArchitectureBoxUV(
  geometry: THREE.BoxGeometry,
  dimensions: [number, number, number],
  map: ArchitectureMap,
) {
  const uv = geometry.attributes.uv;
  const normal = geometry.attributes.normal;
  const [tileU, tileV] = ARCHITECTURE_TILE_METRES[map];
  const [x, y, z] = dimensions;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    uv.setXY(
      i,
      (uv.getX(i) * (nx * z + (ny + nz) * x)) / tileU,
      (uv.getY(i) * (ny * z + (nx + nz) * y)) / tileV,
    );
  }
  return geometry;
}

const instanceMaterials = new WeakMap<
  THREE.Material,
  Map<ArchitectureMap, THREE.Material>
>();

/** One material variant per existing material/atlas, never per building. */
function instanceMaterial(source: THREE.Material, map: ArchitectureMap) {
  let variants = instanceMaterials.get(source);
  if (!variants) {
    variants = new Map();
    instanceMaterials.set(source, variants);
  }
  let material = variants.get(map);
  if (!material) {
    material = source.clone();
    const previousCompile = source.onBeforeCompile;
    const previousKey = source.customProgramCacheKey();
    const [tileU, tileV] = ARCHITECTURE_TILE_METRES[map];
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.vertexShader =
        `attribute vec3 architectureDimensions;\n${shader.vertexShader}`.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
        #ifdef USE_MAP
          vec3 architectureFace = abs(normal);
          vec2 architectureSize = vec2(
            architectureFace.x * architectureDimensions.z +
              (architectureFace.y + architectureFace.z) * architectureDimensions.x,
            architectureFace.y * architectureDimensions.z +
              (architectureFace.x + architectureFace.z) * architectureDimensions.y
          );
          vMapUv = (mapTransform * vec3(uv * architectureSize / vec2(${tileU.toFixed(1)}, ${tileV.toFixed(1)}), 1.0)).xy;
        #endif`,
        );
    };
    material.customProgramCacheKey = () =>
      `${previousKey}:architecture-uv:${map}`;
    variants.set(map, material);
  }
  return material;
}

/** Call after setMatrixAt. Non-box shapes must not call this helper. */
export function applyArchitectureInstanceUV(
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>,
  map: ArchitectureMap,
) {
  const dimensions = new Float32Array(mesh.count * 3);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    scale.setFromMatrixScale(matrix);
    scale.toArray(dimensions, i * 3);
  }
  // Each batch owns its instance attribute; shared primitive geometry stays intact.
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute(
    "architectureDimensions",
    new THREE.InstancedBufferAttribute(dimensions, 3),
  );
  mesh.material = instanceMaterial(mesh.material, map);
}
