/** Exact XZ nearest-neighbour lookup; equal distances retain input order. */
export function createNearestPointIndex(points) {
  const size = points.length;
  const xs = Float64Array.from(points, (p) => p.x);
  const zs = Float64Array.from(points, (p) => p.z);
  const indices = new Int32Array(size);
  const left = new Int32Array(size).fill(-1);
  const right = new Int32Array(size).fill(-1);
  const axes = new Uint8Array(size);
  let cursor = 0;
  function build(order, axis) {
    if (!order.length) return -1;
    const coordinates = axis ? zs : xs;
    order.sort((a, b) => coordinates[a] - coordinates[b] || a - b);
    const middle = Math.floor(order.length / 2);
    const node = cursor++;
    indices[node] = order[middle];
    axes[node] = axis;
    left[node] = build(order.slice(0, middle), 1 - axis);
    right[node] = build(order.slice(middle + 1), 1 - axis);
    return node;
  }
  const root = build(
    Array.from(points, (_, i) => i),
    0,
  );
  // Queries are synchronous. Reuse traversal storage instead of allocating it
  // for every terrain vertex; no returned result refers to this scratch space.
  const stack = new Int32Array(size);
  const lowerBounds = new Float64Array(size);
  return function nearest(x, z) {
    let best = -1;
    let distance = Infinity;
    let pending = 0;
    if (root !== -1) {
      stack[pending] = root;
      lowerBounds[pending++] = 0;
    }
    while (pending) {
      const bound = lowerBounds[--pending];
      const node = stack[pending];
      if (bound > distance) continue;
      const index = indices[node];
      const dx = x - xs[index];
      const dz = z - zs[index];
      const candidate = dx ** 2 + dz ** 2;
      if (candidate < distance || (candidate === distance && index < best)) {
        best = index;
        distance = candidate;
      }
      const delta = axes[node] ? dz : dx;
      const near = delta < 0 ? left[node] : right[node];
      const far = delta < 0 ? right[node] : left[node];
      const planeDistance = delta ** 2;
      // Equality must remain searchable: a lower original index can win a tie.
      if (far !== -1 && planeDistance <= distance) {
        stack[pending] = far;
        lowerBounds[pending++] = Math.max(bound, planeDistance);
      }
      if (near !== -1) {
        stack[pending] = near;
        lowerBounds[pending++] = bound;
      }
    }
    return best;
  };
}
