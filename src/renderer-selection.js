export function selectedRenderer(
  storage = localStorage,
  search = location.search,
) {
  const requested = new URLSearchParams(search).get("renderer");
  const saved = requested ?? storage.getItem("nv-renderer");
  return saved === "webgpu" ? "webgpu" : "webgl";
}

export function rendererURL(mode, href = location.href) {
  const url = new URL(href);
  url.searchParams.set("renderer", mode);
  return url.href;
}

export function selectRenderer(mode) {
  localStorage.setItem("nv-renderer", mode);
  location.assign(rendererURL(mode));
}

export function showRendererFailure(element, mode, error) {
  element.hidden = false;
  const message = document.createElement("p");
  message.textContent = `${mode === "webgpu" ? "WebGPU" : "WebGL"} could not start. ${error.message}`;
  element.replaceChildren(message);
  if (mode === "webgpu") {
    const button = document.createElement("button");
    button.textContent = "USE WEBGL";
    button.onclick = () => selectRenderer("webgl");
    element.append(button);
  }
}
