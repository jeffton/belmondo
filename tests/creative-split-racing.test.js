import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { measureFork } from "./helpers/fork-diagnostics.js";

const root = fileURLToPath(new URL("..", import.meta.url));
for (const [name, index] of [
  ["Whiteout", 0],
  ["Coast", 2],
  ["Cinderline", 4],
]) {
  test(`${name}: both redesigned branches earn a clean pickup-free merge for every craft/class`, async () => {
    const report = await measureFork(root, index);
    assert.equal(report.traversals.length, 18);
    const clear = report.splitS[1] + 0.015 * report.trackLengthWorldUnits;
    const expectedGate =
      Math.floor(
        ((clear - report.finishS) / report.trackLengthWorldUnits) * 32,
      ) + 1;
    for (const run of report.traversals) {
      const context = `${run.craft}/${run.className}/branch${run.branch}`;
      assert(
        run.spawnS < report.splitS[0] - 0.04 * report.trackLengthWorldUnits,
        context,
      );
      assert.equal(run.pickupCount, 0, context);
      assert.equal(run.completed, true, context);
      assert.equal(run.eliminated, false, context);
      assert.deepEqual(run.observedBranches, [run.branch], context);
      assert.equal(run.wrongBranchSteps, 0, context);
      assert.equal(run.contacts, 0, context);
      assert.equal(run.recoveries, 0, context);
      assert.deepEqual(run.stalls, [], context);
      assert(run.elapsedSplitSeconds > 0, context);
      assert(
        run.entry.time < run.exit.time && run.exit.time < run.clear.time,
        context,
      );
      assert(
        run.last.gate >= expectedGate,
        `${context}: physical merge must earn its timing gates`,
      );
      assert(run.earnedGates > 0, context);
      for (let i = 0; i < run.gateTransitions.length; i++) {
        const gate = run.gateTransitions[i];
        assert.equal(gate.to, gate.from + 1, context);
        if (i > 0)
          assert.equal(gate.from, run.gateTransitions[i - 1].to, context);
      }
    }
    for (let craft = 0; craft < 3; craft++) {
      for (let speedClass = 0; speedClass < 3; speedClass++) {
        const runs = report.traversals.filter(
          (r) => r.craftIndex === craft && r.speedClass === speedClass,
        );
        const times = runs.map((r) => r.elapsedSplitSeconds);
        const ratio = Math.max(...times) / Math.min(...times);
        // Explicit design target, not a generic arbitrary safety quota.
        assert(
          ratio <= 1.04,
          `${name}/${craft}/${speedClass}: route time ratio ${ratio} exceeds 4% target`,
        );
      }
    }
  });
}
