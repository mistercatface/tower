import { setupLabViewportNavigation } from "./lab-shared.js";
import { GAME_MODE_ZOOM_MAX, TILELAB_ZOOM_MIN } from "../../../Libraries/Viewport/tileLabViewportLimits.js";
/** @type {((dt: number) => void) | null} */
let tickKeyboardPan = null;
let fittedStageWidth = -1;
let fittedStageHeight = -1;
/** @param {number} dt */
export function tickGameViewportNavigation(dt) {
    tickKeyboardPan?.(dt);
}
export function resetGameCanvasStageFit() {
    fittedStageWidth = -1;
    fittedStageHeight = -1;
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onStageResize */
export function mountGameViewport(state, onStageResize) {
    tickKeyboardPan = setupLabViewportNavigation("gameCanvas", {
        getCamera: () => state.viewport,
        setCamera: (x, y, zoom) => {
            state.viewport.snapTo(x, y);
            state.viewport.setZoom(zoom);
        },
        onRightDragStart: () => {
            state.followCamera?.clear();
            state.sandbox.controller?.session?.clearSelection();
        },
        minZoom: TILELAB_ZOOM_MIN,
        maxZoom: GAME_MODE_ZOOM_MAX,
    });
    resetGameCanvasStageFit();
    const stage = document.getElementById("gameStage");
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(onStageResize).observe(stage);
}
/** @param {import("../state.js").TileLabGameState} state @returns {boolean} */
export function fitGameCanvasToStage(state) {
    const canvas = state.editor.canvas;
    const stage = document.getElementById("gameStage");
    const rect = stage.getBoundingClientRect();
    const stageWidth = Math.floor(rect.width);
    const stageHeight = Math.floor(rect.height);
    if (stageWidth === fittedStageWidth && stageHeight === fittedStageHeight) return false;
    fittedStageWidth = stageWidth;
    fittedStageHeight = stageHeight;
    const size = Math.max(128, Math.min(stageWidth, stageHeight));
    if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
        state.editor.ctx.imageSmoothingEnabled = false;
    }
    const sizePx = `${size}px`;
    if (canvas.style.width !== sizePx) canvas.style.width = sizePx;
    if (canvas.style.height !== sizePx) canvas.style.height = sizePx;
    state.viewport.setCanvasSize(size, size);
    return true;
}
