import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeTrack, roadBounds, TRACKS, TRACK_INDEX } from "../src/track.ts";
import { Race } from "../src/race.ts";
import {
  getTrackPickups,
  pickupOutline,
  pickupPoint,
  crossesPickup,
} from "../src/pickups.ts";
import { buildTrackPads } from "../src/track-pads.ts";

const hoverPoint = (track, pad, x, z) =>
  pickupPoint(track, pad, x, z).add(new THREE.Vector3(0, 2.2, 0));

for (let course = 0; course < TRACKS.length; course++) {
  const track = makeTrack(course);
  const pads = getTrackPickups(track);
  test(`${track.config.name}: authored pickup lines fit the deck and offer accessible and edge rewards`, () => {
    const branches = track.config.split[0] >= 0 ? [-1, 1] : [0];
    for (const branch of branches)
      assert(pads.some((p) => p.branch === branch));
    for (const type of ["boost", "weapon"]) {
      assert(
        pads.some((p) => p.type === type && Math.abs(p.lateral) < p.width / 2),
      );
      assert(
        pads.some((p) => p.type === type && Math.abs(p.lateral) > p.width / 2),
      );
    }
    for (const pad of pads) {
      for (const [x, z] of [...pickupOutline(pad), [-5.5, -45], [5.5, -45]]) {
        const s = pad.s + z;
        const bounds = roadBounds(track, s, pad.branch);
        assert(
          !track.gap(s / track.length),
          `${pad.id}: pad/approach cannot sit over the jump`,
        );
        assert(pad.lateral + x > bounds.wallMin + 1);
        assert(pad.lateral + x < bounds.wallMax - 1);
      }
      // The approach needs no instantaneous lane change: the previous reward is
      // hundreds of metres away, and the full lane remains visible before contact.
      const previous = pads
        .filter(
          (p) => p.s < pad.s && (p.branch === pad.branch || p.branch === 0),
        )
        .at(-1);
      if (previous)
        assert(
          (pad.s - previous.s) / Math.abs(pad.lateral - previous.lateral || 1) >
            6,
        );
    }
  });
  test(`${track.config.name}: actual silhouettes award aimed high-speed paths, not centre-lane misses or other branches`, () => {
    for (const pad of pads) {
      const before = hoverPoint(track, pad, 0, -20),
        after = hoverPoint(track, pad, 0, 20);
      assert(crossesPickup(track, pad, before, after, pad.branch), pad.id);
      assert(
        !crossesPickup(
          track,
          pad,
          hoverPoint(track, pad, 6, -20),
          hoverPoint(track, pad, 6, 20),
          pad.branch,
        ),
      );
      if (Math.abs(pad.lateral) > pad.width / 2)
        assert(
          !crossesPickup(
            track,
            pad,
            hoverPoint(track, pad, -pad.lateral, -20),
            hoverPoint(track, pad, -pad.lateral, 20),
            pad.branch,
          ),
        );
      if (pad.branch)
        assert(!crossesPickup(track, pad, before, after, -pad.branch));
      const high = new THREE.Vector3(0, 15, 0);
      assert(
        !crossesPickup(
          track,
          pad,
          before.clone().add(high),
          after.clone().add(high),
          pad.branch,
        ),
      );
      // Clipped socket corners are not invisible square pickup regions.
      if (pad.type === "weapon") {
        const corner = hoverPoint(track, pad, 3.8, 3.8);
        assert(!crossesPickup(track, pad, corner, corner, pad.branch));
      }
    }
  });
  test(`${track.config.name}: renderer uses the shared collision silhouette and opaque batches`, () => {
    const scene = new THREE.Scene();
    buildTrackPads(scene, track, {
      boost: new THREE.Texture(),
      arms: new THREE.Texture(),
    });
    for (const pad of pads) {
      const rendered = scene.children.filter(
        (m) => m.name === `track-pads-${pad.type}`,
      );
      for (const [x, z] of pickupOutline(pad)) {
        const expected = pickupPoint(track, pad, x, z, 0.14);
        assert(
          rendered.some((m) => {
            const p = m.geometry.getAttribute("position");
            for (let i = 0; i < p.count; i++)
              if (
                new THREE.Vector3()
                  .fromBufferAttribute(p, i)
                  .distanceTo(expected) < 0.001
              ) {
                const uv = m.geometry.getAttribute("uv");
                // Check actual rendered UVs against an independent chase camera:
                // an image's right/down axes must remain right/down on screen.
                const frame = track.frame(pad.s + z, pad.branch);
                const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
                const origin = pickupPoint(track, pad, 0, z, 0.14);
                camera.up.copy(frame.up);
                camera.position
                  .copy(origin)
                  .addScaledVector(frame.tangent, -20)
                  .addScaledVector(frame.up, 12);
                camera.lookAt(origin);
                camera.updateMatrixWorld();
                const horizontal = expected.clone().project(camera).x;
                assert.equal(
                  Math.sign(uv.getX(i) - 0.5),
                  Math.sign(horizontal),
                );
                const ahead = pickupPoint(track, pad, x, z + 0.1, 0.14);
                const vertical =
                  ahead.project(camera).y - expected.clone().project(camera).y;
                // CanvasTexture.flipY: canvas y=1-v. Forward is screen up.
                assert.equal(
                  Math.sign(1 - uv.getY(i) - 0.5),
                  -Math.sign(z * vertical),
                );
                return true;
              }
            return false;
          }),
        );
      }
    }
    for (const mesh of scene.children) assert(!mesh.material.transparent);
  });
}

test("Race grants the aimed pickup once per earned lap, preserving miss and branch semantics", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  for (const type of ["weapon", "boost"]) {
    const race = new Race(track);
    race.countdown = 0;
    race.racers = [race.player];
    const r = race.player;
    const pad = race.pickups.find((p) => p.type === type && p.branch === 0);
    const place = (x, lap = 1) => {
      const f = track.frame(pad.s);
      r.position.copy(hoverPoint(track, pad, x, 0));
      r.velocity.set(0, 0, 0);
      r.s = r.contactS = pad.s + (lap - 1) * track.length;
      r.lap = lap;
      r.gate = Math.floor((r.s / track.length) * 32) + 1;
      r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
      r.branch = 0;
      r.grounded = true;
    };
    place(6);
    race.update(1 / 120, {});
    assert.equal(r.collectedPickups.size, 0);
    place(0);
    race.update(1 / 120, {});
    assert.equal(r.collectedPickups.size, 1);
    assert(type === "boost" ? r.surge > 0 : r.weapon !== null);
    assert.deepEqual(
      race.events.filter(
        (event) => event.kind === type || event.kind === "pickup",
      ),
      [
        {
          kind: type === "weapon" ? "pickup" : "boost",
          text: type === "weapon" ? r.weapon : "BOOST",
        },
      ],
      "only actual acquired player inventory/boost emits its notification",
    );
    r.shield = 50;
    race.update(1 / 120, {});
    assert.equal(r.collectedPickups.size, 1);
    assert.equal(
      r.shield,
      50,
      "remaining on a collected weapon cannot repeatedly refill shields",
    );
    const weapon = r.weapon;
    race.events.length = 0;
    place(0, 2);
    race.update(1 / 120, {});
    assert.equal(r.collectedPickups.size, 2);
    assert.equal(r.shield, 50, "Combat pickups do not refill shields");
    if (type === "weapon") {
      assert.equal(r.weapon, weapon, "armed craft keeps its weapon");
      assert(!race.events.some((event) => event.kind === "pickup"));
    }
  }
});

test("Time Attack weapon pads refill shield once per pad per lap without arming the player", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track, 0, "trial");
  race.countdown = 0;
  const r = race.player;
  assert.equal(r.shield, 100);
  assert.equal(r.weapon, null);
  const weaponPads = race.pickups.filter(
    (pad) => pad.type === "weapon" && pad.branch === 0,
  );
  const boostPad = race.pickups.find(
    (pad) => pad.type === "boost" && pad.branch === 0,
  );
  const cross = (pad, lap) => {
    const f = track.frame(pad.s);
    r.position.copy(hoverPoint(track, pad, 0, -pad.length * 0.6));
    r.velocity.copy(f.tangent).multiplyScalar(180);
    r.s = r.contactS = pad.s - pad.length * 0.6 + (lap - 1) * track.length;
    r.lap = lap;
    r.gate = Math.floor((r.s / track.length) * 32) + 1;
    r.yaw = Math.atan2(f.tangent.x, f.tangent.z);
    r.branch = 0;
    r.grounded = true;
    for (let i = 0; i < 6; i++) race.update(1 / 120, {});
    assert(r.collectedPickups.has(`${lap}:${pad.id}`));
    assert.equal(r.weapon, null);
  };

  r.shield = 73;
  cross(boostPad, 1);
  assert(r.surge > 0);
  assert.equal(r.shield, 73);
  cross(weaponPads[0], 1);
  assert.equal(r.shield, 83);
  cross(weaponPads[0], 1);
  assert.equal(r.shield, 83);
  cross(weaponPads[1], 1);
  assert.equal(r.shield, 93);
  cross(weaponPads[0], 2);
  assert.equal(r.shield, 100);
  assert(!race.events.some((event) => event.kind === "pickup"));
});

test("AI inventory pickups never emit player weapon announcements", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track);
  race.countdown = 0;
  const ai = race.racers[1];
  const pad = race.pickups.find((p) => p.type === "weapon" && p.branch === 0);
  const frame = track.frame(pad.s);
  ai.position.copy(hoverPoint(track, pad, 0, 0));
  ai.velocity.set(0, 0, 0);
  ai.s = ai.contactS = pad.s;
  ai.gate = Math.floor((pad.s / track.length) * 32) + 1;
  ai.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  ai.branch = 0;
  ai.grounded = true;
  race.update(1 / 120, {});
  assert(ai.weapon);
  assert(!race.events.some((event) => event.kind === "pickup"));
});

test("lethal AI PULSE elimination cannot grant an unvisited pickup across the old checkpoint path", () => {
  const track = makeTrack(TRACK_INDEX.COAST);
  const race = new Race(track);
  race.countdown = 0;
  race.racers = race.racers.slice(0, 2);
  const victim = race.player,
    shooter = race.racers[1];
  const pad = race.pickups.find(
    (p) => p.type === "weapon" && Math.abs(p.lateral) < 4,
  );
  const frame = track.frame(pad.s);
  victim.position.copy(hoverPoint(track, pad, 0, 20));
  victim.contactS = victim.s = pad.s + 20;
  victim.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  victim.shield = 1;
  victim.gate = Math.floor(((pad.s - 20) / track.length) * 32) + 1;
  victim.checkpoint = { s: pad.s - 20, branch: 0, gate: victim.gate };
  const checkpoint = track
    .frame(victim.checkpoint.s)
    .p.add(new THREE.Vector3(0, 2.2, 0));
  assert(
    crossesPickup(track, pad, victim.position, checkpoint, 0),
    "fixture spans the pickup only via rescue teleport",
  );
  shooter.position.copy(victim.position).addScaledVector(frame.tangent, -8);
  shooter.s = shooter.contactS = pad.s + 12;
  shooter.yaw = victim.yaw;
  shooter.weapon = "PULSE";
  shooter.aiFire = 0;
  race.update(1 / 120, {});
  assert(victim.eliminated);
  assert.equal(victim.shield, 0);
  assert.equal(victim.recoveredThisStep, false);
  const terminalPosition = victim.position.clone();
  for (let step = 0; step < 10; step++) race.update(1 / 120, {});
  assert(victim.position.equals(terminalPosition));
  assert.equal(victim.collectedPickups.size, 0);
  assert.equal(victim.weapon, null);
});
