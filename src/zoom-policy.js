// Safari exposes pinch gestures separately from the pointer events used to fly.
// Keep cancellation limited to zoom; menu scrolling and simultaneous controls
// must retain their normal touch/pointer event streams.
export function installZoomPolicy(target = document) {
  const preventZoom = (event) => event.preventDefault();
  const preventPinchWheel = (event) => {
    if (event.ctrlKey) event.preventDefault();
  };
  const gestures = ["gesturestart", "gesturechange", "gestureend"];
  for (const type of gestures)
    target.addEventListener(type, preventZoom, { passive: false });
  target.addEventListener("wheel", preventPinchWheel, { passive: false });

  return () => {
    for (const type of gestures) target.removeEventListener(type, preventZoom);
    target.removeEventListener("wheel", preventPinchWheel);
  };
}
