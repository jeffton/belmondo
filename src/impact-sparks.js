import * as THREE from "three";
import { hullExtent } from "./contacts.js";

// Reuse the impact pool's 64 slots. Each spark is a thin, velocity-aligned
// streak, not a tumbling solid; no textures, lights or per-frame allocations.
export class ImpactSparks {
  constructor(scene) {
    this.particles = Array.from({ length: 64 }, () => ({
      life: 0,
      duration: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }));
    this.cursor = 0;
    this.positions = new Float32Array(this.particles.length * 6);
    this.colors = new Float32Array(this.positions.length);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.mesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.mesh.visible = false;
    // Pool is tiny; don't recompute its bounding sphere or cull moving streaks
    // against an old bound. Depth testing still keeps sparks behind the track.
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  reset() {
    for (const particle of this.particles) particle.life = 0;
    this.mesh.visible = false;
  }

  burst(racer, frame, random = Math.random) {
    // The final rail-settle pass can emit an impact without wallTouched.
    // Its position still identifies the contacting edge in the local frame.
    const side = racer.wallTouched
      ? racer.wallSide
      : Math.sign(racer.position.clone().sub(frame.p).dot(frame.right));
    const speed = racer.velocity.length();
    for (let i = 0; i < 10; i++) {
      const particle = this.particles[this.cursor++ % this.particles.length];
      particle.duration = particle.life = 0.1 + random() * 0.13;
      particle.position.copy(racer.position);
      if (side)
        particle.position.addScaledVector(
          frame.right,
          side * hullExtent(racer, frame.right),
        );
      // Retain some momentum in world space, but shed it rapidly enough to
      // trail the ship. Rail impacts throw the hot fragments into the lane.
      particle.velocity
        .copy(racer.velocity)
        .multiplyScalar(0.18 + random() * 0.18)
        .addScaledVector(
          frame.right,
          side
            ? -side * (5 + random() * (8 + speed * 0.025))
            : (random() - 0.5) * 18,
        )
        .addScaledVector(frame.up, 2 + random() * 9)
        .addScaledVector(frame.tangent, (random() - 0.5) * 8);
    }
  }

  update(dt) {
    let visible = 0;
    for (const particle of this.particles) {
      particle.life = Math.max(0, particle.life - dt);
      if (particle.life === 0) continue;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.velocity.y -= 22 * dt;
      const heat = particle.life / particle.duration;
      const offset = visible++ * 6;
      // A short exposure streak contracts as the fragment cools. Its head
      // starts almost white and cools through gold to deep amber, never RGB.
      const exposure = 0.004 + heat * 0.009;
      this.positions[offset] =
        particle.position.x - particle.velocity.x * exposure;
      this.positions[offset + 1] =
        particle.position.y - particle.velocity.y * exposure;
      this.positions[offset + 2] =
        particle.position.z - particle.velocity.z * exposure;
      particle.position.toArray(this.positions, offset + 3);
      this.colors[offset] = heat * 0.45;
      this.colors[offset + 1] = heat * heat * 0.16;
      this.colors[offset + 2] = 0;
      this.colors[offset + 3] = heat;
      this.colors[offset + 4] = heat * heat * 0.8;
      this.colors[offset + 5] = heat ** 5 * 0.55;
    }
    this.mesh.visible = visible > 0;
    this.mesh.geometry.setDrawRange(0, visible * 2);
    if (visible) {
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.color.needsUpdate = true;
    }
  }
}
