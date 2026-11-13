/** One request owns its worker and transferable buffers. Obsolete work is stopped. */
export class CoursePreparation {
  constructor(
    createWorker = () =>
      new Worker(new URL("./course-preparation.worker.js", import.meta.url), {
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

  load(index) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      this.pending = { worker, resolve };
      worker.onmessage = ({ data }) => {
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
