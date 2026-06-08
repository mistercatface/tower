export const LAB_ZOOM_MIN = 0.25;
export const LAB_ZOOM_MAX = 2.5;
/** @param {number} zoom */
export function clampLabZoom(zoom) {
    return Math.min(LAB_ZOOM_MAX, Math.max(LAB_ZOOM_MIN, zoom));
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function syncZoomSliderFromViewport(state) {
    const zoomEl = document.getElementById("gameZoomInput");
    if (!zoomEl || !state?.mapViewport) return;
    zoomEl.value = String(state.mapViewport.zoom);
    const valEl = document.getElementById("gameZoomValue");
    if (valEl) valEl.textContent = zoomEl.value;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function applyZoomSliderToViewport(state) {
    const z = Number(document.getElementById("gameZoomInput")?.value);
    if (!state?.mapViewport || !Number.isFinite(z)) return;
    state.mapViewport.zoom = clampLabZoom(z);
}
