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
export function prepareGameCanvas(canvas, stage) {
    if (!canvas || !stage) return null;
    const rect = stage.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width < 32 || height < 32) return null;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return { width, height };
}
/** Sync canvas pixel size, state.canvasBounds, and mapViewport cx/cy together. */
export function syncLabScreenCanvasBounds(state) {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    const size = prepareGameCanvas(canvas, stage);
    if (!size) return null;
    state.canvasBounds = { width: size.width, height: size.height };
    state.mapViewport.setCanvasSize(size.width, size.height);
    return size;
}
