import type { createTerrain } from "./terrain.ts";
import type { paintSky } from "./sky.ts";

export interface PreparedCourse {
  terrain: ReturnType<typeof createTerrain>["prepared"];
  sky: ReturnType<typeof paintSky>;
  workerMs: number;
}

/** One request owns its worker and transferable buffers. Obsolete work is stopped. */
export class CoursePreparation {
  declare createWorker: () => Worker;
  declare pending: {
    worker: Worker;
    resolve: (value: PreparedCourse | null) => void;
  } | null;
  constructor(
    createWorker = () =>
      new Worker(new URL("./course-preparation.worker.ts", import.meta.url), {
        type: "module",
      }),
  ) {
    this.createWorker = createWorker;
    this.pending = null;
  }

  cancel() {
    if (!this.pending) return;
    const { worker, resolve } = this.pending;
    this.pending = null;
    worker.terminate();
    resolve(null);
  }

  load(index: number): Promise<PreparedCourse | null> {
    this.cancel();
    return new Promise<PreparedCourse | null>((resolve, reject) => {
      const worker = this.createWorker();
      this.pending = { worker, resolve };
      worker.onmessage = ({ data }: MessageEvent<PreparedCourse>) => {
        if (this.pending?.worker !== worker) return;
        this.pending = null;
        worker.terminate();
        resolve(data);
      };
      worker.onerror = (error) => {
        if (this.pending?.worker !== worker) return;
        this.pending = null;
        worker.terminate();
        reject(new Error(`Course preparation failed: ${error.message}`));
      };
      worker.postMessage(index);
    });
  }
}
