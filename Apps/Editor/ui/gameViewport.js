import { setupLabViewportNavigation } from "./lab-shared.js";
import { getDefaultSimulationZoom } from "../../../Render/SimulationViewport.js";
import { clampZoom } from "../../../Libraries/Viewport/index.js";
import { LAB_PREVIEW_RANGE } from "../state.js";
import { LAB_ZOOM_MAX, LAB_ZOOM_MIN } from "./labViewport.js";
export const GAME_MODE_ZOOM_MULTIPLIER = 1.75;
/** @type {((dt: number) => void) | null} */
let tickKeyboardPan = null;
/** @param {number} dt */
export function tickGameViewportNavigation(dt) {
    tickKeyboardPan?.(dt);
}
/** @param {import("../state.js").TileLabGameState} state */
export function mountGameViewport(state) {
    tickKeyboardPan = setupLabViewportNavigation("gameCanvas", {
        getCamera: () => state.viewport,
        setCamera: (x, y, zoom) => {
            state.viewport.snapTo(x, y);
            state.viewport.zoom = zoom;
        },
    });
}
/** @param {import("../state.js").TileLabGameState} state */
export function fitGameCanvasToStage(state) {
    const canvas = state.editor.canvas;
    const stage = document.getElementById("gameStage");
    const rect = stage.getBoundingClientRect();
    const size = Math.max(128, Math.floor(Math.min(rect.width, rect.height)));
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    state.viewport.setCanvasSize(size, size);
}
/** @param {import("../state.js").TileLabGameState} state @param {number} [zoomMultiplier] */
export function fitGameStageToView(state, zoomMultiplier = GAME_MODE_ZOOM_MULTIPLIER) {
    const baseZoom = getDefaultSimulationZoom(state.viewport.width, state.viewport.height, LAB_PREVIEW_RANGE, LAB_PREVIEW_RANGE);
    state.viewport.zoom = clampZoom(LAB_ZOOM_MIN, LAB_ZOOM_MAX, baseZoom * zoomMultiplier);
}
