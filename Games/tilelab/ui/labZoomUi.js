import { applyZoomControl, clampZoom, directZoomMapping } from "../../../Libraries/Viewport/index.js";
export const LAB_ZOOM_MIN = 0.25;
export const LAB_ZOOM_MAX = 2.5;
function clampLabZoom(zoom) {
    return clampZoom(LAB_ZOOM_MIN, LAB_ZOOM_MAX, zoom);
}
/** @type {import("../../../Libraries/Viewport/zoomControl.js").ZoomControlHandle | null} */
let labZoomControl = null;
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} onZoomChange
 */
export function mountLabZoomControl(state, onZoomChange) {
    labZoomControl = applyZoomControl(document.getElementById("labZoomControl"), {
        inject: true,
        prefix: "Cam",
        ...directZoomMapping({ min: LAB_ZOOM_MIN, max: LAB_ZOOM_MAX, step: 0.05 }),
        getZoom: () => state.mapViewport.zoom,
        setZoom: (zoom) => {
            state.mapViewport.zoom = zoom;
            onZoomChange();
        },
    });
    return labZoomControl;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {number} zoom */
export function pushLabZoomToControl(state, zoom) {
    state.mapViewport.zoom = clampLabZoom(zoom);
    labZoomControl?.setZoom(state.mapViewport.zoom);
}
