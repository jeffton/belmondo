import test from "node:test";
import assert from "node:assert/strict";
import { makeTrack, TRACK_INDEX } from "../src/track.js";
import { Race, CRAFT } from "../src/race.js";

const legacy = [
  { index: 0, id: "coast-4-finish-end", technical: [0.43, 0.51], turbo: 0.42 },
  { index: 1, id: "solar-4-finish-end", technical: [0.77, 0.92], turbo: 0.77 },
  {
    index: 2,
    id: "noctilucent-4-finish-end",
    technical: [0.08, 0.19],
    turbo: 0.08,
  },
];

function physicalRadius(track, s, branch = 0) {
  const a = track.frame(s - 1, branch);
  const b = track.frame(s + 1, branch);
  const angle = a.tangent.setY(0).angleTo(b.tangent.setY(0));
  return a.p.setY(0).distanceTo(b.p.setY(0)) / angle;
}

for (const { index, id, technical, turbo } of legacy) {
  const track = makeTrack(index);
  test(`${id}: substantial climbing, visible technical corners and real runouts`, () => {
    assert.equal(track.config.layoutId, id);
    // The previous circuits were 5.6–6.4km. Authored districts and multiple
    // elevation changes, rather than an extra empty straight, add the distance.
    assert(track.physicalLength > 10000);
    let high = -Infinity;
    let low = Infinity;
    let climbs = 0;
    let descents = 0;
    let previousGrade = 0;
    let shortestRadius = Infinity;
    for (let i = 0; i < 6000; i++) {
      const s = (i / 6000) * track.length;
      const f = track.frame(s);
      high = Math.max(high, f.p.y);
      low = Math.min(low, f.p.y);
      const grade = Math.abs(f.tangent.y) > 0.08 ? Math.sign(f.tangent.y) : 0;
      if (grade && grade !== previousGrade) {
        if (grade > 0) climbs++;
        else descents++;
        previousGrade = grade;
      }
      if (f.u >= technical[0] && f.u <= technical[1])
        shortestRadius = Math.min(shortestRadius, physicalRadius(track, s));
      for (const branch of [-1, 1]) {
        const next = track.frame(s + 1, branch);
        const current = track.frame(s, branch);
        if (
          !track.gap(f.u) &&
          Math.abs(f.u - track.config.jump) > 2 / track.length
        )
          assert(current.p.distanceTo(next.p) < 1.6, "no hidden route step");
      }
    }
    assert(high - low > 280, "real elevation range, not camera motion");
    assert(climbs >= 3 && descents >= 3, "multiple climb/compression cycles");
    assert(
      shortestRadius < 125,
      "technical apex requires a real pace decision",
    );
    const [homeStart, homeEnd] = track.config.sections.finishStraight;
    const a = track.frame(homeStart * track.length);
    const b = track.frame(homeEnd * track.length);
    const axis = b.p.clone().sub(a.p).normalize();
    assert(a.p.distanceTo(b.p) > 450);
    for (let j = 0; j <= 50; j++) {
      const p = track.frame(
        (homeStart + ((homeEnd - homeStart) * j) / 50) * track.length,
      ).p;
      const offset = p.sub(a.p);
      assert(offset.addScaledVector(axis, -offset.dot(axis)).length() < 0.05);
    }
    const launch = track.frame(track.config.jump * track.length);
    for (
      let u = track.config.jump + track.config.gapLength;
      u < track.config.sections.runway[1];
      u += 0.003
    ) {
      const landing = track.frame(u * track.length);
      assert(Math.abs(landing.p.sub(launch.p).dot(launch.right)) < 0.05);
    }
  });

  for (const speedClass of [0, 1, 2]) {
    for (const boosted of [false, true]) {
      test(`${id}: class ${speedClass + 1}, ${boosted ? "TURBO" : "ordinary"}, whole physical lap`, () => {
        const race = new Race(track, speedClass, "trial", speedClass);
        race.countdown = 0;
        const r = race.player;
        r.id = 1;
        r.aiFire = Infinity;
        let fired = false;
        let resets = 0;
        let previousGate = r.gate;
        const recover = race.recover.bind(race);
        race.recover = (...args) => {
          resets++;
          return recover(...args);
        };
        for (let step = 0; step < 120 * 120 && r.lap < 2; step++) {
          if (boosted && !fired && r.contactS > turbo * track.length) {
            r.weapon = "TURBO";
            race.fire(r);
            fired = true;
          }
          race.update(1 / 120, {});
          assert(r.gate >= previousGate && r.gate <= previousGate + 1);
          previousGate = r.gate;
        }
        assert.equal(r.lap, 2, "every gate and the real finish were crossed");
        assert.equal(resets, 0, "no checkpoint/void rescue earns the lap");
        assert(r.shield > 50, "not a wall-grinding completion");
        if (boosted) assert(fired);
      });
    }
  }

  for (const speedClass of [0, 1, 2]) {
    for (const branch of [-1, 1]) {
      for (const boosted of [false, true]) {
        test(`${id}: class ${speedClass + 1}, fork ${branch}, ${boosted ? "TURBO" : "ordinary"}, real separated body earns merge`, () => {
          const race = new Race(track, speedClass, "trial", speedClass);
          race.countdown = 0;
          const r = race.player;
          const [start, end] = track.config.split;
          const s = (start + (end - start) * 0.55) * track.length;
          const f = track.frame(s, branch);
          Object.assign(r, {
            id: branch === -1 ? 1 : 2,
            branch,
            s,
            contactS: s,
            gate: Math.floor((s / track.length) * 32) + 1,
            yaw: Math.atan2(f.tangent.x, f.tangent.z),
            aiFire: Infinity,
          });
          r.checkpoint = { s, branch, gate: r.gate };
          r.position.copy(f.p);
          r.position.y += 2.2;
          r.velocity
            .copy(f.tangent)
            .multiplyScalar(
              CRAFT[speedClass].speed * race.classSpec.pace * 0.7,
            );
          r.speed = r.velocity.length();
          if (boosted) {
            r.weapon = "TURBO";
            race.fire(r);
          }
          let separated = 0;
          let resets = 0;
          const recover = race.recover.bind(race);
          race.recover = (...args) => {
            resets++;
            return recover(...args);
          };
          const destination = (end + 0.035) * track.length;
          for (
            let step = 0;
            step < 30 * 120 && r.contactS < destination;
            step++
          ) {
            race.update(1 / 120, {});
            if (
              r.contactS < end * track.length &&
              !track.bounds(r.contactS, branch).connected
            ) {
              assert.equal(r.branch, branch);
              separated++;
            }
          }
          assert(
            r.contactS >= destination,
            "chosen route reaches its own merge",
          );
          assert.equal(resets, 0);
          assert.equal(r.branch, 0);
          assert(separated > 20);
          assert(r.shield > 50);
        });
      }
    }
  }
}

test("legacy redesign retains Night's grade-separated figure eight and bored lower fork", () => {
  const track = makeTrack(TRACK_INDEX.NOCTILUCENT);
  const [crossing] = track.config.sections.crossings;
  assert.equal(track.config.sections.crossings.length, 1);
  assert(crossing.clearance > 250);
  const upper = track.frame(crossing.upperU * track.length);
  const lower = track.frame(crossing.lowerU * track.length);
  assert(Math.hypot(upper.p.x - lower.p.x, upper.p.z - lower.p.z) < 0.001);
  const mid = (track.config.split[0] + track.config.split[1]) / 2;
  const high = track.frame(mid * track.length, 1);
  const low = track.frame(mid * track.length, -1);
  assert(Math.hypot(high.p.x - low.p.x, high.p.z - low.p.z) < 0.02);
  assert(high.p.y - low.p.y > 44.9);
  assert.equal(track.isTunnel(mid * track.length, -1), true);
  assert.equal(track.isTunnel(mid * track.length, 1), false);
  assert(track.config.split[1] < track.config.jump);
});
