import { applyZoomControl, clampZoom, directZoomMapping } from "../../../Libraries/Viewport/index.js";
import { getDefaultSimulationZoom } from "../../../Render/SimulationViewport.js";
import { setupLabViewportNavigation } from "../../../Tools/Lab/lab-shared.js";
import { LAB_PREVIEW_RANGE } from "../config.js";
import { syncLabScreenCanvasBounds } from "./labCanvas.js";
export const LAB_ZOOM_MIN = 0.25;
export const LAB_ZOOM_MAX = 2.5;
/** @type {import("../../../Libraries/Viewport/zoomControl.js").ZoomControlHandle | null} */
let zoomControl = null;
/** @type {(() => void) | null} */
let notifyViewChange = null;
function clampLabZoom(zoom) {
    return clampZoom(LAB_ZOOM_MIN, LAB_ZOOM_MAX, zoom);
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {number} x @param {number} y @param {number} zoom */
function applyCamera(state, x, y, zoom) {
    syncLabScreenCanvasBounds(state);
    state.mapViewport.snapTo(x, y);
    state.mapViewport.zoom = clampLabZoom(zoom);
    zoomControl?.setZoom(state.mapViewport.zoom);
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {number} x @param {number} y @param {number} zoom */
export function setLabCamera(state, x, y, zoom) {
    applyCamera(state, x, y, zoom);
    notifyViewChange?.();
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function fitLabStageToView(state) {
    syncLabScreenCanvasBounds(state);
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const zoom = getDefaultSimulationZoom(viewW, viewH, LAB_PREVIEW_RANGE, LAB_PREVIEW_RANGE);
    state.mapViewport.zoom = clampLabZoom(zoom);
    zoomControl?.setZoom(state.mapViewport.zoom);
}
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} onViewChange
 */
export function mountLabViewport(state, onViewChange) {
    notifyViewChange = onViewChange;
    zoomControl = applyZoomControl(document.getElementById("labZoomControl"), {
        inject: true,
        prefix: "Cam",
        ...directZoomMapping({ min: LAB_ZOOM_MIN, max: LAB_ZOOM_MAX, step: 0.05 }),
        getZoom: () => state.mapViewport.zoom,
        setZoom: (zoom) => {
            state.mapViewport.zoom = clampLabZoom(zoom);
            onViewChange();
        },
    });
    setupLabViewportNavigation("gameCanvas", { getCamera: () => state.mapViewport, setCamera: (x, y, zoom) => applyCamera(state, x, y, zoom), onUpdate: onViewChange });
}
