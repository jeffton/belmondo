import * as THREE from "three";

type Vent = { origin: THREE.Vector3; height: number; phase: number };

// Three upright, camera-facing impostors in a single batch. The ash field
// stretches, curls and thins as it drifts; it is not a stack of visible puffs.
export function buildCinderFumaroles(
  root: THREE.Object3D,
  vents: Vent[],
  haze: THREE.Color,
) {
  const position: number[] = [];
  const vent: number[] = [];
  const phase: number[] = [];
  const bounds = new THREE.Box3();
  const min = new THREE.Vector3();
  const max = new THREE.Vector3();
  for (const { origin, height, phase: seed } of vents) {
    const halfWidth = height * 0.72;
    for (const [x, y] of [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [-1, 1],
      [1, 0],
      [1, 1],
    ]) {
      position.push(x * halfWidth, y * height, y);
      vent.push(origin.x, origin.y, origin.z);
      phase.push(seed);
    }
    min.set(origin.x - halfWidth, origin.y, origin.z - halfWidth);
    max.set(origin.x + halfWidth, origin.y + height, origin.z + halfWidth);
    bounds.expandByPoint(min).expandByPoint(max);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("vent", new THREE.Float32BufferAttribute(vent, 3));
  geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phase, 1));
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());

  const uniforms = {
    time: { value: 0 },
    ash: { value: new THREE.Color(0x493b43).lerp(haze, 0.16) },
    mist: { value: new THREE.Color(0x8a7478).lerp(haze, 0.22) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 vent;
      attribute float phase;
      varying vec2 plume;
      varying float seed;
      varying float drift;

      void main() {
        vec2 sight = cameraPosition.xz - vent.xz;
        vec2 right = normalize(vec2(sight.y, -sight.x) + vec2(0.0001, 0.0));
        vec3 point = vent + vec3(right.x * position.x, position.y, right.y * position.x);
        plume = vec2(position.x, position.z);
        seed = phase;
        drift = dot(right, vec2(0.88, 0.47));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 ash;
      uniform vec3 mist;
      varying vec2 plume;
      varying float seed;
      varying float drift;

      float grain(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(grain(i), grain(i + vec2(1, 0)), f.x),
          mix(grain(i + vec2(0, 1)), grain(i + vec2(1, 1)), f.x),
          f.y
        );
      }

      void main() {
        float h = plume.y;
        float t = time * 0.7 + seed;
        float curl = sin(h * 13.0 - t * 1.8) * h;
        float bend = drift * 103.0 * pow(h, 1.45) + curl * 14.0;
        float spread = 10.0 + h * 51.0;
        float crosswind = (plume.x - bend) / spread;
        // Move both turbulence bands upward through the stationary silhouette.
        vec2 flow = vec2((plume.x - bend) * 0.035, h * 7.0 - t);
        float wisps = noise(flow) * 0.68 + noise(flow * 2.21 + vec2(seed)) * 0.32;
        float edge = 1.0 - smoothstep(0.18, 1.15, abs(crosswind) + (0.5 - wisps) * 0.72);
        float lift = smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.33, 1.0, h));
        float density = edge * lift * smoothstep(0.12, 0.76, wisps) * 0.84;
        if (density < 0.008) discard;
        // A dusky, banded tone suits the game's low-resolution silhouettes.
        float tone = floor(clamp(h * 0.49 + wisps * 0.55, 0.0, 1.0) * 6.0) / 6.0;
        gl_FragColor = vec4(mix(ash, mist, tone), density);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cinder-volcano-fumaroles";
  root.add(mesh);
  return (time: number) => {
    uniforms.time.value = time;
  };
}
