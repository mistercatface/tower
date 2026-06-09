/**
 * Commit lab canvas pixel size into game state. Call only when the canvas buffer changes.
 *
 * @param {import("../index.js").TileLabGameState} state
 * @param {number} width
 * @param {number} height
 */
export function applyLabCanvasSize(state, width, height) {
    state.viewport.setCanvasSize(width, height);
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
