import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { refreshLabMapBoundsPreview } from "../world/mapWorld.js";
import { drawCavernBoundsPreview, drawWorldBoundsBox, mountOverviewBoundsEditors } from "./cavernBoundsOverviewEditor.js";
import { drawCellBoundsPreview } from "./cellBoundsOverview.js";
/** @typedef {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} MapOverviewCache */
let overviewCtx = null;
/** Blit cached map and draw live viewport / generation bounds — not part of the bake. */
export function paintMapOverviewFrame(state) {
    if (!state.editor.showMapOverview) return;
    const stage = document.getElementById("mapOverviewStage");
    const canvas = document.getElementById("mapOverviewCanvas");
    if (!stage || !canvas || stage.hidden) return;
    let cache = state.mapOverviewCache;
    if (!cache && state.obstacleGrid?.cols) {
        rebuildLabMapCaches(state);
        cache = state.mapOverviewCache;
    }
    const ctx = overviewCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cache) return;
    ctx.drawImage(cache.canvas, 0, 0, canvas.width, canvas.height);
    const displayW = canvas.width;
    const displayH = canvas.height;
    refreshLabMapBoundsPreview(state);
    if (state.editor.showMapOverviewViewport) drawWorldBoundsBox(ctx, state.viewport.boundsClip, cache, displayW, displayH, "#00e5ff");
    if (state.editor.showMapOverviewGenBounds) {
        drawWorldBoundsBox(ctx, state.editor.mapBoundsPreview.playArea, cache, displayW, displayH, "#76ff03", 2, [6, 4]);
        const cavernConfig = state.editor.cavernConfig;
        if (cavernConfig.boundsMode === "rect") drawWorldBoundsBox(ctx, state.editor.mapBoundsPreview.cavern, cache, displayW, displayH, "#ff9800", 2);
        else drawCavernBoundsPreview(ctx, cavernConfig, cache, displayW, displayH);
    }
    if (state.editor.showMapOverviewRailBounds) {
        const railConfig = state.editor.railConfig;
        if (railConfig.boundsMode === "rect") drawWorldBoundsBox(ctx, state.editor.mapBoundsPreview.rail, cache, displayW, displayH, "#e040fb", 2);
        else drawCavernBoundsPreview(ctx, railConfig, cache, displayW, displayH, "#e040fb");
    }
    if (state.editor.showMapOverviewWallBounds) drawCellBoundsPreview(ctx, state.editor.wallToolConfig, state.editor.mapBoundsPreview.wall, cache, displayW, displayH, "#f44336", 2);
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
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onBoundsChange] */
export function mountMapOverview(state, onBoundsChange = null) {
    const canvas = document.getElementById("mapOverviewCanvas");
    overviewCtx = canvas.getContext("2d");
    applySquareCanvasResize(canvas, { host: document.getElementById("mapOverviewHost"), initialSize: 160, minSize: 96, maxSize: 512, onResize: () => paintMapOverviewFrame(state) });
    if (onBoundsChange) mountOverviewBoundsEditors(canvas, state, onBoundsChange);
    paintMapOverviewFrame(state);
}
