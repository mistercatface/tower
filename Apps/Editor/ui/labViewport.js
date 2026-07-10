import { applySpeedControl } from "../../../Libraries/Playback/index.js";
import { applyZoomControl, clampZoom, directZoomMapping } from "../../../Libraries/Viewport/index.js";
import { fitTileLabStageZoom, TILELAB_ZOOM_MAX, TILELAB_ZOOM_MIN } from "../../../Libraries/Viewport/tileLabViewportLimits.js";
import { setupLabViewportNavigation } from "./lab-shared.js";
/** @type {import("../../../Libraries/Viewport/zoomControl.js").ZoomControlHandle | null} */
let zoomControl = null;
/** @type {import("../../../Libraries/Playback/speedControl.js").SpeedControlHandle | null} */
let speedControl = null;
/** @type {((dt: number) => void) | null} */
let tickKeyboardPan = null;
/** @param {number} dt */
export function tickLabViewportNavigation(dt) {
    tickKeyboardPan?.(dt);
}
function clampLabZoom(zoom) {
    return clampZoom(TILELAB_ZOOM_MIN, TILELAB_ZOOM_MAX, zoom);
}
/** @param {import("../state.js").TileLabGameState} state */
export function fitLabStageToView(state) {
    const range = Math.max(state.editor.playConfig.playAreaCols, state.editor.playConfig.playAreaRows) * 16;
    fitTileLabStageZoom(state.viewport, 1, 2.5, range);
    zoomControl?.setZoom(state.viewport.zoom);
}
/** @param {import("../state.js").TileLabGameState} state @param {{ playbackHandlers: import("../../../Libraries/Playback/speedControl.js").PlaybackHandlers }} options */
export function mountLabViewport(state, onViewChange, playbackHandlers) {
    zoomControl = applyZoomControl(document.getElementById("labZoomControl"), {
        inject: true,
        prefix: "Cam",
        ...directZoomMapping({ min: TILELAB_ZOOM_MIN, max: TILELAB_ZOOM_MAX, step: 0.05 }),
        getZoom: () => state.viewport.zoom,
        setZoom: (zoom) => {
            state.viewport.setZoom(clampLabZoom(zoom));
            onViewChange();
        },
    });
    speedControl = applySpeedControl(document.getElementById("labSpeedControl"), { inject: true, playbackHandlers });
    speedControl.refresh(state);
    tickKeyboardPan = setupLabViewportNavigation("gameCanvas", {
        getCamera: () => state.viewport,
        setCamera: (x, y, zoom) => {
            state.viewport.snapTo(x, y);
            const nextZoom = clampLabZoom(zoom);
            const zoomChanged = state.viewport.zoom !== nextZoom;
            state.viewport.setZoom(nextZoom);
            if (zoomChanged) zoomControl.setZoom(state.viewport.zoom);
            onViewChange();
        },
    });
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshLabSpeed(state) {
    speedControl?.refresh(state);
}
export function syncLabViewportZoomUi(state) {
    zoomControl?.setZoom(state.viewport.zoom);
}
