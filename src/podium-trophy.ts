import * as THREE from "three";
import type { ProgressionRace } from "./progression.ts";

const colors = [0xe6a72e, 0xb9cbd6, 0xcd8157];

// The circuit-button cup silhouette, extruded into a faceted solid with open handles.
export function createPodiumTrophy() {
  const shape = new THREE.Shape();
  const points = [
    [7, 2],
    [25, 2],
    [25, 7],
    [32, 7],
    [32, 16],
    [24, 23],
    [21, 23],
    [18, 27],
    [18, 33],
    [25, 33],
    [25, 38],
    [7, 38],
    [7, 33],
    [14, 33],
    [14, 27],
    [11, 23],
    [8, 23],
    [0, 16],
    [0, 7],
    [7, 7],
  ];
  const trace = (path: THREE.Path, vertices: number[][]) => {
    vertices.forEach(([x, y], i) =>
      i
        ? path.lineTo((x - 16) / 10, (20 - y) / 10)
        : path.moveTo((x - 16) / 10, (20 - y) / 10),
    );
    path.closePath();
  };
  trace(shape, points);
  for (const points of [
    [
      [7, 11],
      [4, 11],
      [4, 14],
      [8, 18],
    ],
    [
      [25, 11],
      [24, 18],
      [28, 14],
      [28, 11],
    ],
  ]) {
    const hole = new THREE.Path();
    trace(hole, points);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.65,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.325);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: colors[0],
      metalness: 0.55,
      roughness: 0.36,
      flatShading: true,
    }),
  );
}

export function podiumPlace(
  race: Pick<ProgressionRace, "mode" | "player" | "position">,
) {
  return race.mode === "race" &&
    race.player.finished &&
    !race.player.eliminated &&
    race.position >= 1 &&
    race.position <= 3
    ? race.position
    : null;
}

export class PodiumTrophy {
  declare element: HTMLDivElement;
  declare place: number | null;
  declare angle: number;
  declare reducedMotion: MediaQueryList;
  declare renderer: THREE.WebGLRenderer;
  declare scene: THREE.Scene;
  declare model: ReturnType<typeof createPodiumTrophy>;
  declare camera: THREE.OrthographicCamera;
  declare width: number;
  declare height: number;
  declare ratio: number;
  constructor(private readonly heading: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "podium-trophy";
    this.element.setAttribute("role", "img");
    this.place = null;
    this.angle = -0.3;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  }

  clear() {
    this.place = null;
    this.element.remove();
  }

  setResult(race: Pick<ProgressionRace, "mode" | "player" | "position">) {
    this.clear();
    this.place = podiumPlace(race);
    if (!this.place) return;
    this.angle = -0.3;
    this.heading.append(this.element);
    this.element.dataset.place = String(this.place);
    this.element.setAttribute(
      "aria-label",
      `${["Gold", "Silver", "Bronze"][this.place - 1]} trophy — ${this.place}${["st", "nd", "rd"][this.place - 1]} place in the last race`,
    );
  }

  draw(dt: number) {
    if (!this.place || document.hidden) return;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setClearColor(0, 0);
      this.element.append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.model = createPodiumTrophy();
      this.scene.add(
        this.model,
        new THREE.HemisphereLight(0xffffff, 0x35475c, 2.4),
      );
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-3, 4, 5);
      this.scene.add(key);
      this.camera = new THREE.OrthographicCamera(-2, 2, 2.4, -2.4, 0.1, 20);
      this.camera.position.set(0, 0.55, 8);
      this.camera.lookAt(0, 0, 0);
    }
    const { width, height } = this.element.getBoundingClientRect();
    const ratio = window.devicePixelRatio;
    if (
      this.width !== width ||
      this.height !== height ||
      this.ratio !== ratio
    ) {
      this.renderer.setDrawingBufferSize(width, height, ratio);
      this.width = width;
      this.height = height;
      this.ratio = ratio;
      this.camera.left = (-2.4 * width) / height;
      this.camera.right = -this.camera.left;
      this.camera.updateProjectionMatrix();
    }
    if (!this.reducedMotion.matches) this.angle += dt * 0.32;
    this.model.rotation.y = this.angle;
    this.model.material.color.setHex(colors[this.place - 1]);
    this.renderer.render(this.scene, this.camera);
  }
}
