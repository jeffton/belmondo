import { makeTrack } from "./track.js";
import { createTerrain } from "./terrain.js";
import { paintSky } from "./sky.js";

self.onmessage = ({ data: index }) => {
  const start = performance.now();
  const track = makeTrack(index);
  const terrain = createTerrain(track).prepared;
  const fog =
    track.config.name === "KAISEKI COAST" ? 0x788391 : track.config.fog;
  const sky = paintSky(track.config, fog, 2048, 1024);
  const buffers = new Set([terrain.heights.buffer, sky.data.buffer]);
  for (const geometry of terrain.geometries) {
    for (const attribute of Object.values(geometry.attributes))
      buffers.add(attribute.array.buffer);
    if (geometry.index) buffers.add(geometry.index.array.buffer);
  }
  self.postMessage({ terrain, sky, workerMs: performance.now() - start }, [
    ...buffers,
  ]);
};
