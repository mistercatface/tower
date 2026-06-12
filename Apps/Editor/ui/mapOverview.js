import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { getCavernBoundsPreview, getPlayAreaPreviewBounds, labCavernConfig, labPlayConfig } from "../world/mapWorld.js";
/** @typedef {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} MapOverviewCache */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {MapOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @param {string} strokeStyle
 * @param {number} [lineWidth]
 * @param {number[]} [dash]
 */
function drawWorldBoundsBox(ctx, bounds, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0) return;
    const x = ((bounds.minX - cache.minX) / mapW) * displayW;
    const y = ((bounds.minY - cache.minY) / mapH) * displayH;
    const w = ((bounds.maxX - bounds.minX) / mapW) * displayW;
    const h = ((bounds.maxY - bounds.minY) / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../../Libraries/Viewport/Viewport.js").Viewport} viewport @param {MapOverviewCache} cache @param {number} displayW @param {number} displayH */
function drawViewportBox(ctx, viewport, cache, displayW, displayH) {
    drawWorldBoundsBox(
        ctx,
        { minX: viewport.x - viewport.halfW, minY: viewport.y - viewport.halfH, maxX: viewport.x + viewport.halfW, maxY: viewport.y + viewport.halfH },
        cache,
        displayW,
        displayH,
        "#00e5ff",
    );
}
/** Blit cached map and draw live viewport / generation bounds — not part of the bake. */
export function paintMapOverviewFrame(state) {
    if (!state.labShowMapOverview) return;
    const stage = document.getElementById("mapOverviewStage");
    const canvas = document.getElementById("mapOverviewCanvas");
    if (!stage || !canvas || stage.hidden) return;
    let cache = state.mapOverviewCache;
    if (!cache && state.obstacleGrid?.cols) {
        rebuildLabMapCaches(state);
        cache = state.mapOverviewCache;
    }
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cache) return;
    ctx.drawImage(cache.canvas, 0, 0, canvas.width, canvas.height);
    const displayW = canvas.width;
    const displayH = canvas.height;
    if (state.labShowMapOverviewViewport) drawViewportBox(ctx, state.viewport, cache, displayW, displayH);
    if (state.labShowMapOverviewGenBounds) {
        drawWorldBoundsBox(ctx, getPlayAreaPreviewBounds(state.viewport, labPlayConfig), cache, displayW, displayH, "#76ff03", 2, [6, 4]);
        drawWorldBoundsBox(ctx, getCavernBoundsPreview(labCavernConfig), cache, displayW, displayH, "#ff9800", 2);
    }
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
