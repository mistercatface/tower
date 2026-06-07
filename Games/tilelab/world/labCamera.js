import { getLabFocus, setLabFocus } from "./mapFocus.js";
export function getSurfaceZoom() {
    return Number(document.getElementById("gameZoomInput")?.value) || 1;
}
export function setSurfaceZoom(zoom) {
    const zoomInput = document.getElementById("gameZoomInput");
    if (!zoomInput) return;
    const clamped = Math.min(2.5, Math.max(0.25, zoom));
    zoomInput.value = String(clamped);
    const valEl = document.getElementById("gameZoomValue");
    if (valEl) valEl.textContent = zoomInput.value;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function syncTopologyCameraFromSurface(state) {
    const focus = getLabFocus(state);
    state.mapViewport.snapTo(focus.x, focus.y);
    state.mapViewport.zoom = getSurfaceZoom();
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function syncSurfaceCameraFromTopology(state) {
    setLabFocus(state, state.mapViewport.x, state.mapViewport.y);
    setSurfaceZoom(state.mapViewport.zoom);
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {import("../ui/viewMode.js").LabViewMode} nextMode */
export function syncCamerasForViewMode(state, nextMode) {
    const prevMode = state.labViewMode;
    if (nextMode === "topology") syncTopologyCameraFromSurface(state);
    else if (nextMode === "surface") syncSurfaceCameraFromTopology(state);
    else if (nextMode === "both")
        if (prevMode === "topology") syncSurfaceCameraFromTopology(state);
        else syncTopologyCameraFromSurface(state);
}
