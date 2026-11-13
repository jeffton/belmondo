import test from "node:test";
import assert from "node:assert/strict";
import { CoursePreparation } from "../src/course-preparation.js";

function setup() {
  const workers = [];
  const loader = new CoursePreparation(() => {
    const worker = {
      terminated: false,
      postMessage(index) {
        this.index = index;
      },
      terminate() {
        this.terminated = true;
      },
    };
    workers.push(worker);
    return worker;
  });
  return { loader, workers };
}

test("rapid selection cancels obsolete CPU work and ignores late deliveries", async () => {
  const { loader, workers } = setup();
  const obsolete = loader.load(0);
  const selected = loader.load(6);
  assert.equal(await obsolete, null);
  assert.equal(workers[0].terminated, true);
  workers[0].onmessage({ data: { track: 0 } });
  assert.equal(loader.pending.worker, workers[1]);
  workers[1].onmessage({ data: { track: 6 } });
  assert.deepEqual(await selected, { track: 6 });
  assert.equal(workers[1].terminated, true);
  assert.equal(loader.pending, null);
});

test("worker failures remain errors and release the worker", async () => {
  const { loader, workers } = setup();
  const selected = loader.load(2);
  workers[0].onerror({ message: "raster failed" });
  await assert.rejects(selected, /Course preparation failed: raster failed/);
  assert.equal(workers[0].terminated, true);
  assert.equal(loader.pending, null);
});
