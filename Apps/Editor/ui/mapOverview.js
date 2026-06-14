import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { EDITOR_CANVAS_DEFAULTS } from "../state.js";
import { refreshLabMapBoundsPreview } from "../world/mapWorld.js";
import { drawCavernBoundsPreview, drawWorldBoundsBox, mountOverviewBoundsEditors } from "./cavernBoundsOverviewEditor.js";
/** @typedef {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} MapOverviewCache */
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let overviewCanvasResize = null;
let overviewCtx = null;
/** @param {import("../state.js").TileLabGameState} state @returns {"cavern" | "rail" | null} */
export function activeMapGenKind(state) {
    const key = state.sandbox.controller?.getPlacePaletteKey();
    if (key === "gen:cavern") return "cavern";
    if (key === "gen:rail") return "rail";
    return null;
}
/** Blit cached map and draw live viewport / generation bounds — not part of the bake. */
export function paintMapOverviewFrame(state) {
    if (!state.editor.showMapOverview) return;
    const stage = document.getElementById("mapOverviewStage");
    const canvas = document.getElementById("mapOverviewCanvas");
    if (!stage || !canvas || stage.hidden) return;
    const cache = state.mapOverviewCache;
    const ctx = overviewCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cache.canvas, 0, 0, canvas.width, canvas.height);
    const displayW = canvas.width;
    const displayH = canvas.height;
    refreshLabMapBoundsPreview(state);
    if (state.editor.showMapOverviewViewport) drawWorldBoundsBox(ctx, state.viewport.boundsClip, cache, displayW, displayH, "#00e5ff");
    const genKind = activeMapGenKind(state);
    if (genKind === "cavern") {
        const cavernConfig = state.editor.cavernConfig;
        if (cavernConfig.boundsMode === "rect") drawWorldBoundsBox(ctx, state.editor.mapBoundsPreview.cavern, cache, displayW, displayH, "#ff9800", 2);
        else drawCavernBoundsPreview(ctx, cavernConfig, cache, displayW, displayH);
    } else if (genKind === "rail") {
        const railConfig = state.editor.railConfig;
        if (railConfig.boundsMode === "rect") drawWorldBoundsBox(ctx, state.editor.mapBoundsPreview.rail, cache, displayW, displayH, "#e040fb", 2);
        else drawCavernBoundsPreview(ctx, railConfig, cache, displayW, displayH, "#e040fb");
    }
}
/** Vertical space for main map max-size when overview is visible. */
export function estimateMapOverviewHeight() {
    const stage = document.getElementById("mapOverviewStage");
    if (!stage || stage.hidden) return 0;
    return overviewCanvasResize.getSize();
}
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onBoundsChange] */
export function mountMapOverview(state, onBoundsChange = null) {
    const { initialSize, minSize, maxSize } = EDITOR_CANVAS_DEFAULTS.overview;
    const canvas = document.getElementById("mapOverviewCanvas");
    overviewCtx = canvas.getContext("2d");
    rebuildLabMapCaches(state);
    overviewCanvasResize = applySquareCanvasResize(canvas, { host: document.getElementById("mapOverviewHost"), initialSize, minSize, maxSize, onResize: () => paintMapOverviewFrame(state) });
    if (onBoundsChange) mountOverviewBoundsEditors(canvas, state, onBoundsChange);
    paintMapOverviewFrame(state);
}
export function syncMapOverviewCanvasSize() {
    overviewCanvasResize.setSize(overviewCanvasResize.getSize());
}
