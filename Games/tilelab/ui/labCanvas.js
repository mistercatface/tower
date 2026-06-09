/** @typedef {{ width: number, height: number }} LabCanvasSize */
/** @type {HTMLElement | null} */
let labStage = null;
/** @type {HTMLCanvasElement | null} */
let labCanvas = null;
/** Cache lab DOM nodes once after the shell mounts. */
export function bindLabCanvasElements(stage, canvas) {
    labStage = stage ?? null;
    labCanvas = canvas ?? null;
}
export function clearLabCanvasElements() {
    labStage = null;
    labCanvas = null;
}
export function getLabStage() {
    if (!labStage) labStage = document.getElementById("mapStage");
    return labStage;
}
export function getLabCanvas() {
    if (!labCanvas) labCanvas = document.getElementById("gameCanvas");
    return labCanvas;
}
/** Map a DOM pointer position to canvas pixel coordinates (handles CSS scaling). */
export function canvasClientToScreen(canvas, clientX, clientY) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}
/** @param {import("../../../Libraries/Viewport/Viewport.js").Viewport} viewport */
export function canvasClientToWorld(canvas, viewport, clientX, clientY) {
    const screen = canvasClientToScreen(canvas, clientX, clientY);
    if (!screen) return null;
    return viewport.screenToWorld(screen.x, screen.y);
}
/**
 * Read the stage's laid-out CSS size. Only call from explicit resize / fit-to-view paths.
 * @returns {LabCanvasSize | null}
 */
export function measureLabStageSize(stage = getLabStage()) {
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width < 32 || height < 32) return null;
    return { width, height };
}
/**
 * Sync state.canvasBounds and mapViewport cx/cy from the canvas pixel buffer.
 * Canvas width/height are owned by resize handlers (square-canvas-resize, resizer, etc.).
 *
 * @param {import("../index.js").TileLabGameState} state
 * @returns {LabCanvasSize | null}
 */
export function syncLabScreenCanvasBounds(state) {
    const canvas = getLabCanvas();
    if (!canvas || canvas.width < 32 || canvas.height < 32) return null;
    const width = canvas.width;
    const height = canvas.height;
    if (state.canvasBounds?.width === width && state.canvasBounds?.height === height) return { width, height };
    state.canvasBounds = { width, height };
    state.mapViewport.setCanvasSize(width, height);
    return { width, height };
}
