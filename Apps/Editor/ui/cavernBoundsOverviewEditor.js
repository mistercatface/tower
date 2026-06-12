import { gridSettings } from "../../../Config/Config.js";
import { getCavernCenterWorld, getCavernInnerRadiusCells, migrateCavernConfigForMode } from "../world/cavernBounds.js";
const EDGE_HIT_PX = 8;
/**
 * @param {number} wx
 * @param {number} wy
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 */
function worldToScreen(wx, wy, cache, displayW, displayH) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    return { x: ((wx - cache.minX) / mapW) * displayW, y: ((wy - cache.minY) / mapH) * displayH };
}
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 */
function screenToWorld(sx, sy, cache, displayW, displayH) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    return { x: cache.minX + (sx / displayW) * mapW, y: cache.minY + (sy / displayH) * mapH };
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH @param {string} strokeStyle @param {number} [lineWidth] @param {number[]} [dash] */
function drawWorldCircle(ctx, cx, cy, radius, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0 || radius <= 0) return;
    const center = worldToScreen(cx, cy, cache, displayW, displayH);
    const rx = (radius / mapW) * displayW;
    const ry = (radius / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @param {string} strokeStyle
 * @param {number} [lineWidth]
 * @param {number[]} [dash]
 */
export function drawWorldBoundsBox(ctx, bounds, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
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
/** @param {CanvasRenderingContext2D} ctx @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH */
export function drawCavernBoundsPreview(ctx, config, cache, displayW, displayH) {
    const cellSize = gridSettings.cellSize;
    const center = getCavernCenterWorld(config, cellSize);
    const outerR = config.outerRadiusCells * cellSize;
    drawWorldCircle(ctx, center.x, center.y, outerR, cache, displayW, displayH, "#ff9800", 2);
    if (config.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(config) * cellSize;
        drawWorldCircle(ctx, center.x, center.y, innerR, cache, displayW, displayH, "#ff9800", 2, [4, 4]);
    }
}
/** @typedef {"move" | "resize-outer" | "resize-inner" | "resize-e" | "resize-w" | "resize-n" | "resize-s" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw"} CavernDragMode */
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../state.js").TileLabGameState} state
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @returns {CavernDragMode | null}
 */
export function hitTestCavernBounds(sx, sy, state, cache, displayW, displayH) {
    const config = state.labCavernConfig;
    const cellSize = gridSettings.cellSize;
    const world = screenToWorld(sx, sy, cache, displayW, displayH);
    if (config.boundsMode === "rect") {
        const bounds = state.labMapBoundsPreview.cavern;
        const tl = worldToScreen(bounds.minX, bounds.minY, cache, displayW, displayH);
        const br = worldToScreen(bounds.maxX, bounds.maxY, cache, displayW, displayH);
        const left = tl.x;
        const top = tl.y;
        const right = br.x;
        const bottom = br.y;
        const nearLeft = Math.abs(sx - left) <= EDGE_HIT_PX;
        const nearRight = Math.abs(sx - right) <= EDGE_HIT_PX;
        const nearTop = Math.abs(sy - top) <= EDGE_HIT_PX;
        const nearBottom = Math.abs(sy - bottom) <= EDGE_HIT_PX;
        const insideX = sx >= left && sx <= right;
        const insideY = sy >= top && sy <= bottom;
        if (!insideX || !insideY) return null;
        if (nearRight && nearBottom) return "resize-se";
        if (nearLeft && nearBottom) return "resize-sw";
        if (nearRight && nearTop) return "resize-ne";
        if (nearLeft && nearTop) return "resize-nw";
        if (nearRight) return "resize-e";
        if (nearLeft) return "resize-w";
        if (nearBottom) return "resize-s";
        if (nearTop) return "resize-n";
        return "move";
    }
    const center = getCavernCenterWorld(config, cellSize);
    const centerS = worldToScreen(center.x, center.y, cache, displayW, displayH);
    const distPx = Math.hypot(sx - centerS.x, sy - centerS.y);
    const mapW = cache.maxX - cache.minX;
    const outerPx = ((config.outerRadiusCells * cellSize) / mapW) * displayW;
    const innerPx = ((getCavernInnerRadiusCells(config) * cellSize) / mapW) * displayW;
    if (Math.abs(distPx - outerPx) <= EDGE_HIT_PX) return "resize-outer";
    if (config.boundsMode === "donut" && Math.abs(distPx - innerPx) <= EDGE_HIT_PX) return "resize-inner";
    if (distPx < outerPx - EDGE_HIT_PX && (config.boundsMode !== "donut" || distPx > innerPx + EDGE_HIT_PX)) return "move";
    return null;
}
/**
 * @param {CavernDragMode} mode
 * @param {number} dxWorld
 * @param {number} dyWorld
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} config
 */
export function applyCavernBoundsDrag(mode, dxWorld, dyWorld, config) {
    const cellSize = gridSettings.cellSize;
    const dxCells = dxWorld / cellSize;
    const dyCells = dyWorld / cellSize;
    if (config.boundsMode === "rect") {
        if (mode === "move") {
            config.boundsCol += Math.round(dxCells);
            config.boundsRow += Math.round(dyCells);
        } else if (mode === "resize-e") config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
        else if (mode === "resize-w") {
            const next = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsCol += Math.round(config.boundsCols - next);
            config.boundsCols = next;
        } else if (mode === "resize-s") config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        else if (mode === "resize-n") {
            const next = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsRow += Math.round(config.boundsRows - next);
            config.boundsRows = next;
        } else if (mode === "resize-se") {
            config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
            config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        } else if (mode === "resize-sw") {
            const nextCols = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsCol += Math.round(config.boundsCols - nextCols);
            config.boundsCols = nextCols;
            config.boundsRows = Math.max(1, Math.round(config.boundsRows + dyCells));
        } else if (mode === "resize-ne") {
            config.boundsCols = Math.max(1, Math.round(config.boundsCols + dxCells));
            const nextRows = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsRow += Math.round(config.boundsRows - nextRows);
            config.boundsRows = nextRows;
        } else if (mode === "resize-nw") {
            const nextCols = Math.max(1, Math.round(config.boundsCols - dxCells));
            config.boundsCol += Math.round(config.boundsCols - nextCols);
            config.boundsCols = nextCols;
            const nextRows = Math.max(1, Math.round(config.boundsRows - dyCells));
            config.boundsRow += Math.round(config.boundsRows - nextRows);
            config.boundsRows = nextRows;
        }
        config.centerCol = config.boundsCol + Math.floor(config.boundsCols / 2);
        config.centerRow = config.boundsRow + Math.floor(config.boundsRows / 2);
        config.outerRadiusCells = Math.max(1, Math.round(Math.min(config.boundsCols, config.boundsRows) / 2));
        migrateCavernConfigForMode(config);
        return;
    }
    if (mode === "move") {
        config.centerCol += Math.round(dxCells);
        config.centerRow += Math.round(dyCells);
    } else if (mode === "resize-outer") {
        const delta = Math.round((dxCells + dyCells) * 0.5);
        config.outerRadiusCells = Math.max(1, config.outerRadiusCells + delta);
        if (config.boundsMode === "donut") config.donutThicknessCells = Math.min(config.donutThicknessCells, config.outerRadiusCells - 1);
    } else if (mode === "resize-inner") {
        const delta = Math.round((dxCells + dyCells) * 0.5);
        config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, config.donutThicknessCells - delta));
    }
    migrateCavernConfigForMode(config);
}
/**
 * @param {CavernDragMode} mode
 * @param {number} worldX
 * @param {number} worldY
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} config
 */
export function applyCavernBoundsDragAtPointer(mode, worldX, worldY, config) {
    const cellSize = gridSettings.cellSize;
    if (config.boundsMode === "rect") return;
    const center = getCavernCenterWorld(config, cellSize);
    const distCells = Math.hypot(worldX - center.x, worldY - center.y) / cellSize;
    if (mode === "resize-outer") {
        config.outerRadiusCells = Math.max(1, Math.round(distCells));
        if (config.boundsMode === "donut") config.donutThicknessCells = Math.min(config.donutThicknessCells, config.outerRadiusCells - 1);
    } else if (mode === "resize-inner") config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, Math.round(config.outerRadiusCells - distCells)));
    migrateCavernConfigForMode(config);
}
/** @param {CavernDragMode | null} mode */
export function cavernBoundsCursor(mode) {
    if (!mode) return "default";
    if (mode === "move") return "move";
    if (mode === "resize-outer" || mode === "resize-inner") return "nwse-resize";
    if (mode === "resize-e" || mode === "resize-w") return "ew-resize";
    if (mode === "resize-n" || mode === "resize-s") return "ns-resize";
    return "nwse-resize";
}
/** @param {HTMLCanvasElement} canvas @param {import("../state.js").TileLabGameState} state @param {() => void} onChange */
export function mountCavernBoundsOverviewEditor(canvas, state, onChange) {
    /** @type {CavernDragMode | null} */
    let dragMode = null;
    let lastWorldX = 0;
    let lastWorldY = 0;
    const getFrame = () => {
        const cache = state.mapOverviewCache;
        if (!cache) return null;
        return { cache, displayW: canvas.width, displayH: canvas.height };
    };
    canvas.addEventListener("pointermove", (e) => {
        const frame = getFrame();
        if (!frame) return;
        const rect = canvas.getBoundingClientRect();
        const sx = ((e.clientX - rect.left) / rect.width) * frame.displayW;
        const sy = ((e.clientY - rect.top) / rect.height) * frame.displayH;
        if (dragMode) {
            const world = screenToWorld(sx, sy, frame.cache, frame.displayW, frame.displayH);
            if (dragMode === "resize-outer" || dragMode === "resize-inner") applyCavernBoundsDragAtPointer(dragMode, world.x, world.y, state.labCavernConfig);
            else {
                applyCavernBoundsDrag(dragMode, world.x - lastWorldX, world.y - lastWorldY, state.labCavernConfig);
                lastWorldX = world.x;
                lastWorldY = world.y;
            }
            onChange();
            return;
        }
        if (!state.labShowMapOverviewGenBounds) {
            canvas.style.cursor = "default";
            return;
        }
        canvas.style.cursor = cavernBoundsCursor(hitTestCavernBounds(sx, sy, state, frame.cache, frame.displayW, frame.displayH));
    });
    canvas.addEventListener("pointerdown", (e) => {
        if (!state.labShowMapOverviewGenBounds) return;
        const frame = getFrame();
        if (!frame) return;
        const rect = canvas.getBoundingClientRect();
        const sx = ((e.clientX - rect.left) / rect.width) * frame.displayW;
        const sy = ((e.clientY - rect.top) / rect.height) * frame.displayH;
        const hit = hitTestCavernBounds(sx, sy, state, frame.cache, frame.displayW, frame.displayH);
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        dragMode = hit;
        const world = screenToWorld(sx, sy, frame.cache, frame.displayW, frame.displayH);
        lastWorldX = world.x;
        lastWorldY = world.y;
        canvas.setPointerCapture(e.pointerId);
    });
    const finishDrag = (e) => {
        if (!dragMode) return;
        canvas.releasePointerCapture(e.pointerId);
        dragMode = null;
    };
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
}
