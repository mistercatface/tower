import { applySpeedControl } from "../../../Libraries/Playback/index.js";
import { applyZoomControl, clampZoom, directZoomMapping } from "../../../Libraries/Viewport/index.js";
import { getDefaultSimulationZoom } from "../../../Render/SimulationViewport.js";
import { setupLabViewportNavigation } from "./lab-shared.js";
import { LAB_PREVIEW_RANGE } from "../state.js";
export const LAB_ZOOM_MIN = 0.25;
export const LAB_ZOOM_MAX = 2.5;
/** @type {import("../../../Libraries/Viewport/zoomControl.js").ZoomControlHandle | null} */
let zoomControl = null;
/** @type {import("../../../Libraries/Playback/speedControl.js").SpeedControlHandle | null} */
let speedControl = null;
function clampLabZoom(zoom) {
    return clampZoom(LAB_ZOOM_MIN, LAB_ZOOM_MAX, zoom);
}
/** @param {import("../state.js").TileLabGameState} state */
export function fitLabStageToView(state) {
    const viewW = Math.max(320, state.viewport.width || 800);
    const viewH = Math.max(240, state.viewport.height || 600);
    const zoom = getDefaultSimulationZoom(viewW, viewH, LAB_PREVIEW_RANGE, LAB_PREVIEW_RANGE);
    state.viewport.zoom = clampLabZoom(zoom);
    zoomControl?.setZoom(state.viewport.zoom);
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onViewChange */
export function mountLabViewport(state, onViewChange) {
    zoomControl = applyZoomControl(document.getElementById("labZoomControl"), {
        inject: true,
        prefix: "Cam",
        ...directZoomMapping({ min: LAB_ZOOM_MIN, max: LAB_ZOOM_MAX, step: 0.05 }),
        getZoom: () => state.viewport.zoom,
        setZoom: (zoom) => {
            state.viewport.zoom = clampLabZoom(zoom);
            onViewChange();
        },
    });
    speedControl = applySpeedControl(document.getElementById("labSpeedControl"), { inject: true });
    speedControl.refresh(state);
    setupLabViewportNavigation("gameCanvas", {
        getCamera: () => state.viewport,
        setCamera: (x, y, zoom) => {
            state.viewport.snapTo(x, y);
            state.viewport.zoom = clampLabZoom(zoom);
            zoomControl.setZoom(state.viewport.zoom);
        },
        onUpdate: onViewChange,
    });
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshLabSpeed(state) {
    speedControl?.refresh(state);
}
