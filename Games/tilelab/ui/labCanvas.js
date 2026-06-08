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
