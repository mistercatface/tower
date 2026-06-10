import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
/** @typedef {{ canvas: HTMLCanvasElement | OffscreenCanvas, minX: number, minY: number, maxX: number, maxY: number }} MapOverviewCache */
function createBakeCanvas(width, height) {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../../Libraries/Viewport/Viewport.js").Viewport} viewport @param {MapOverviewCache} cache @param {number} displayW @param {number} displayH */
function drawViewportBox(ctx, viewport, cache, displayW, displayH) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0) return;
    const viewMinX = viewport.x - viewport.halfW;
    const viewMinY = viewport.y - viewport.halfH;
    const viewMaxX = viewport.x + viewport.halfW;
    const viewMaxY = viewport.y + viewport.halfH;
    const x = ((viewMinX - cache.minX) / mapW) * displayW;
    const y = ((viewMinY - cache.minY) / mapH) * displayH;
    const w = ((viewMaxX - viewMinX) / mapW) * displayW;
    const h = ((viewMaxY - viewMinY) / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}
/** @param {import("../state.js").TileLabGameState} state @returns {MapOverviewCache | null} */
export function bakeMapOverviewCache(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols || !grid.rows) return null;
    const canvas = createBakeCanvas(grid.cols, grid.rows);
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(grid.cols, grid.rows);
    const pixels = data.data;
    for (let i = 0; i < grid.grid.length; i++) {
        const blocked = grid.grid[i] === 1;
        const offset = i * 4;
        if (blocked) {
            pixels[offset] = 72;
            pixels[offset + 1] = 78;
            pixels[offset + 2] = 88;
            pixels[offset + 3] = 255;
        } else {
            pixels[offset] = 12;
            pixels[offset + 1] = 14;
            pixels[offset + 2] = 18;
            pixels[offset + 3] = 255;
        }
    }
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: grid.minX, minY: grid.minY, maxX: grid.maxX, maxY: grid.maxY };
}
/** Blit cached map and draw live viewport box — not part of the bake. */
export function paintMapOverviewFrame(state) {
    if (!state.labShowMapOverview) return;
    const stage = document.getElementById("mapOverviewStage");
    const canvas = document.getElementById("mapOverviewCanvas");
    if (!stage || !canvas || stage.hidden) return;
    const cache = state.mapOverviewCache;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cache) return;
    ctx.drawImage(cache.canvas, 0, 0, canvas.width, canvas.height);
    if (state.labShowMapOverviewViewport) drawViewportBox(ctx, state.viewport, cache, canvas.width, canvas.height);
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshMapOverviewDisplay(state) {
    paintMapOverviewFrame(state);
}
/** Vertical space for main map max-size when overview is visible. */
export function estimateMapOverviewHeight(fallbackSize = 160) {
    const stage = document.getElementById("mapOverviewStage");
    if (!stage || stage.hidden) return 0;
    const host = document.getElementById("mapOverviewHost");
    const headerH = stage.querySelector(".map-overview-header")?.offsetHeight ?? 18;
    const hostH = host?.offsetHeight ?? fallbackSize;
    return hostH + headerH + 6;
}
/** @param {import("../state.js").TileLabGameState} state */
export function mountMapOverview(state) {
    const canvas = document.getElementById("mapOverviewCanvas");
    applySquareCanvasResize(canvas, { host: document.getElementById("mapOverviewHost"), initialSize: 160, minSize: 96, maxSize: 512, onResize: () => paintMapOverviewFrame(state) });
    paintMapOverviewFrame(state);
}
