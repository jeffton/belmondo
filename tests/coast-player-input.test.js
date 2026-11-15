import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
test("Coast's bore, flyover and common merge work through ordinary player inputs in every craft/class", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const output = join(
    await mkdtemp(join(tmpdir(), "belmondo-coast-player-")),
    "report.json",
  );
  await execute(
    process.execPath,
    [
      fileURLToPath(new URL("./coast-independent-player.mjs", import.meta.url)),
      root,
      output,
    ],
    { timeout: 55000 },
  );
  const { rows } = JSON.parse(await readFile(output, "utf8"));
  assert.equal(rows.length, 18);
  for (const row of rows) {
    const context = `${row.craft}/${row.speedClass}/${row.branch}`;
    assert.equal(row.completed, true, context);
    assert.equal(row.contacts, 0, context);
    assert.equal(row.recoveries, 0, context);
    assert.equal(row.wrongBranchSteps, 0, context);
    assert.equal(row.minShield, 100, context);
    assert.deepEqual(row.stalls, [], context);
    assert(row.maxBackward < 0.001, context);
    assert.equal(row.last.eliminated, false, context);
    assert(row.last.gate >= row.expectedGate, context);
    for (const [before, after] of row.gateTransitions)
      assert.equal(after, before + 1, context);
  }
  for (let craft = 0; craft < 3; craft++) {
    for (let speedClass = 0; speedClass < 3; speedClass++) {
      const times = rows
        .filter((row) => row.craft === craft && row.speedClass === speedClass)
        .map((row) => row.sectorSeconds);
      assert(
        Math.max(...times) / Math.min(...times) < 1.04,
        "neither route is a super-shortcut for the ordinary-input pilot",
      );
    }
  }
});
