import { makeTrack } from "./track.ts";
import { createTerrain } from "./terrain.ts";
import { paintSky } from "./sky.ts";
import type { PreparedCourse } from "./course-preparation.ts";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = ({ data: index }: MessageEvent<number>) => {
  const start = performance.now();
  const track = makeTrack(index);
  const terrain = createTerrain(track).prepared;
  const fog =
    track.config.name === "KAISEKI COAST" ? 0x788391 : track.config.fog;
  const sky = paintSky(track.config, fog, 2048, 1024);
  const buffers = new Set<ArrayBuffer>([
    terrain.heights.buffer as ArrayBuffer,
    sky.data.buffer as ArrayBuffer,
  ]);
  for (const geometry of terrain.geometries) {
    for (const attribute of Object.values(geometry.attributes))
      buffers.add(attribute.array.buffer as ArrayBuffer);
    if (geometry.index) buffers.add(geometry.index.array.buffer as ArrayBuffer);
  }
  self.postMessage(
    {
      terrain,
      sky,
      workerMs: performance.now() - start,
    } satisfies PreparedCourse,
    [...buffers],
  );
};
