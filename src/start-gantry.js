import * as THREE from "three";

// This is the grid's signal mast, not a second timing line. The checker and
// race progression remain at s=0; the display sits ahead in the drivers' view.
export function buildStartGantry(scene, track) {
  const grid = track.frame(0);
  const signal = track.frame(42);
  const assembly = new THREE.Group();
  assembly.name = "grid-signal";
  assembly.position.copy(signal.p);
  assembly.rotation.y = Math.atan2(grid.tangent.x, grid.tangent.z);
  scene.add(assembly);

  const shell = new THREE.MeshLambertMaterial({
    color: 0x27333e,
    flatShading: true,
  });
  const ceramic = new THREE.MeshLambertMaterial({
    color: 0xd4d2bf,
    flatShading: true,
  });
  const orange = new THREE.MeshBasicMaterial({ color: 0xf47d40 });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (material, x, y, z, width, height, depth) => {
    const mesh = new THREE.Mesh(unit, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    assembly.add(mesh);
    return mesh;
  };
  const halfSpan = signal.width + 3.5;
  for (const side of [-1, 1]) {
    box(shell, side * halfSpan, 5.9, 0, 1.1, 15.8, 1.8);
    box(ceramic, side * halfSpan, 0, 0, 2.5, 4, 3.8);
    box(orange, side * halfSpan, 6.5, -0.93, 0.55, 4, 0.08);
    box(ceramic, side * (halfSpan - 2), 13.3, 0, 4.4, 0.7, 1.8);
  }
  box(shell, 0, 13.8, 0, halfSpan * 2 + 1.1, 0.75, 2);
  box(ceramic, 0, 10.5, 0, 23.5, 6.3, 1.3);
  box(shell, 0, 10.5, -0.75, 22.9, 5.7, 0.3);
  // Offset registration blocks give the board its own asymmetrical silhouette.
  box(orange, -12.2, 12.5, -0.2, 1, 2.2, 1.8);
  box(shell, 11.9, 8.5, -0.2, 1.4, 1.3, 1.8);

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(22.3, 5.3),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  display.position.set(0, 10.5, -0.92);
  // PlaneGeometry faces local +Z; the drivers approach from local -Z.
  display.rotation.y = Math.PI;
  display.name = "grid-signal-display";
  assembly.add(display);

  let previousStage;
  const update = (race, demo = false) => {
    const stage = demo
      ? "idle"
      : race.countdown > 3
        ? "armed"
        : race.countdown > 0
          ? Math.ceil(race.countdown)
          : race.time < 1.2
            ? "GO"
            : "idle";
    if (stage === previousStage) return;
    previousStage = stage;
    const active = typeof stage === "number" || stage === "GO";
    const color = stage === "GO" ? "#97ffbf" : "#ffb15a";
    context.fillStyle = "#0b151e";
    context.fillRect(0, 0, 1024, 256);
    context.fillStyle = "#aab5b6";
    context.font = "bold 18px monospace";
    context.textAlign = "left";
    context.fillText("GRID SIGNAL", 30, 33);
    context.textAlign = "right";
    context.fillText("01", 994, 33);
    context.fillStyle = "#35434a";
    context.fillRect(30, 46, 964, 2);
    for (let lamp = 0; lamp < 3; lamp++) {
      const illuminated =
        stage === "GO" || (typeof stage === "number" && lamp >= stage - 1);
      context.fillStyle = illuminated ? color : "#26343d";
      context.fillRect(47 + lamp * 54, 88, 35, 99);
      context.fillRect(942 - lamp * 54, 88, 35, 99);
    }
    context.textAlign = "center";
    context.fillStyle = active ? color : "#59686b";
    context.font = active ? "bold 174px sans-serif" : "bold 48px monospace";
    context.fillText(
      active ? String(stage) : stage === "armed" ? "READY" : "RACE",
      512,
      active ? 216 : 159,
    );
    context.fillStyle = active ? color : "#35434a";
    context.fillRect(256, 235, 512, 5);
    texture.needsUpdate = true;
  };
  update({ countdown: 3.2, time: 0 });
  return { update, assembly };
}
