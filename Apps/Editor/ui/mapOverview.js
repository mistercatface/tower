import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapOverviewCache, rebuildLabPathDebugCache } from "../../../Libraries/Render/map/labMapCaches.js";
import { EDITOR_CANVAS_DEFAULTS } from "../state.js";
import { MAP_GEN_OVERLAY_COLORS, getMapGenBoundsAabbCache, getMapGenBoundsConfig, refreshAllMapGenBoundsPreviews } from "../world/mapGenBounds.js";
import { drawMapGenBoundsPreview, mountOverviewBoundsEditors } from "./mapGenBoundsOverviewEditor.js";
import { drawWorldBoundsBox } from "./mapOverviewDraw.js";
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let overviewCanvasResize = null;
let overviewCtx = null;
/** @param {import("../state.js").TileLabGameState} state @returns {"cavern" | "rail" | "erase" | null} */
export function activeMapGenKind(state) {
    const key = state.sandbox.controller?.getPlacePaletteKey();
    if (key === "gen:cavern") return "cavern";
    if (key === "gen:rail") return "rail";
    if (key === "gen:erase") return "erase";
    return null;
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../state.js").TileLabGameState} state @param {import("../world/mapGenBounds.js").typeof MAP_GEN_KINDS[number]} kind @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH */
function paintMapGenBoundsOverlay(ctx, state, kind, cache, displayW, displayH) {
    const config = getMapGenBoundsConfig(state.editor, kind);
    const color = MAP_GEN_OVERLAY_COLORS[kind];
    if (config.boundsMode === "rect") drawWorldBoundsBox(ctx, getMapGenBoundsAabbCache(state.editor, kind).aabb, cache, displayW, displayH, color, 2);
    else drawMapGenBoundsPreview(ctx, config, cache, displayW, displayH, color);
}
/** Blit cached map and draw live viewport / generation bounds — not part of the bake. */
export function paintMapOverviewFrame(state) {
    if (!state.editor.showMapOverview) return;
    const stage = document.getElementById("mapOverviewStage");
    const canvas = document.getElementById("mapOverviewCanvas");
    if (!stage || !canvas || stage.hidden) return;
    const cache = state.mapOverviewCache;
    const ctx = overviewCtx;
    if (!cache?.canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cache.canvas, 0, 0, canvas.width, canvas.height);
    const displayW = canvas.width;
    const displayH = canvas.height;
    refreshAllMapGenBoundsPreviews(state.editor, gridSettings.cellSize);
    if (state.editor.showMapOverviewViewport) drawWorldBoundsBox(ctx, state.viewport.boundsClip, cache, displayW, displayH, "#00e5ff");
    const genKind = activeMapGenKind(state);
    if (genKind) paintMapGenBoundsOverlay(ctx, state, genKind, cache, displayW, displayH);
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
    rebuildLabMapOverviewCache(state);
    void rebuildLabPathDebugCache(state);
    overviewCanvasResize = applySquareCanvasResize(canvas, { host: document.getElementById("mapOverviewHost"), initialSize, minSize, maxSize, onResize: () => paintMapOverviewFrame(state) });
    if (onBoundsChange) mountOverviewBoundsEditors(canvas, state, onBoundsChange);
    paintMapOverviewFrame(state);
}
export function syncMapOverviewCanvasSize() {
    overviewCanvasResize.setSize(overviewCanvasResize.getSize());
}
