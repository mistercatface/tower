import { gridSettings } from "../../../Config/Config.js";
import { getCellBoundsCenterWorld, migrateCellBoundsForMode } from "../world/cellBoundsConfig.js";
import { drawWorldBoundsBox, drawWorldCircle } from "./mapOverviewDraw.js";
const EDGE_HIT_PX = 8;
/** @param {CanvasRenderingContext2D} ctx @param {import("../world/cellBoundsConfig.js").CellBoundsConfig} config @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} previewAabb @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH @param {string} strokeStyle @param {number} [lineWidth] */
export function drawCellBoundsPreview(ctx, config, previewAabb, cache, displayW, displayH, strokeStyle, lineWidth = 2) {
    if (config.boundsMode === "rect") drawWorldBoundsBox(ctx, previewAabb, cache, displayW, displayH, strokeStyle, lineWidth);
    else {
        const cellSize = gridSettings.cellSize;
        const center = getCellBoundsCenterWorld(config, cellSize);
        drawWorldCircle(ctx, center.x, center.y, config.outerRadiusCells * cellSize, cache, displayW, displayH, strokeStyle, lineWidth);
    }
}
/** @typedef {"move" | "resize-outer" | "resize-e" | "resize-w" | "resize-n" | "resize-s" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw"} CellBoundsDragMode */
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../world/cellBoundsConfig.js").CellBoundsConfig} config
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} previewAabb
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 */
export function hitTestCellBounds(sx, sy, config, previewAabb, cache, displayW, displayH) {
    const cellSize = gridSettings.cellSize;
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (config.boundsMode === "rect") {
        const tlX = ((previewAabb.minX - cache.minX) / mapW) * displayW;
        const tlY = ((previewAabb.minY - cache.minY) / mapH) * displayH;
        const brX = ((previewAabb.maxX - cache.minX) / mapW) * displayW;
        const brY = ((previewAabb.maxY - cache.minY) / mapH) * displayH;
        if (sx < tlX || sx > brX || sy < tlY || sy > brY) return null;
        const nearLeft = Math.abs(sx - tlX) <= EDGE_HIT_PX;
        const nearRight = Math.abs(sx - brX) <= EDGE_HIT_PX;
        const nearTop = Math.abs(sy - tlY) <= EDGE_HIT_PX;
        const nearBottom = Math.abs(sy - brY) <= EDGE_HIT_PX;
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
    const center = getCellBoundsCenterWorld(config, cellSize);
    const centerSx = ((center.x - cache.minX) / mapW) * displayW;
    const centerSy = ((center.y - cache.minY) / mapH) * displayH;
    const distPx = Math.hypot(sx - centerSx, sy - centerSy);
    const outerPx = ((config.outerRadiusCells * cellSize) / mapW) * displayW;
    if (Math.abs(distPx - outerPx) <= EDGE_HIT_PX) return "resize-outer";
    if (distPx < outerPx - EDGE_HIT_PX) return "move";
    return null;
}
/** @param {CellBoundsDragMode} mode @param {number} dxWorld @param {number} dyWorld @param {import("../world/cellBoundsConfig.js").CellBoundsConfig} config */
export function applyCellBoundsDrag(mode, dxWorld, dyWorld, config) {
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
        migrateCellBoundsForMode(config);
        return;
    }
    if (mode === "move") {
        config.centerCol += Math.round(dxCells);
        config.centerRow += Math.round(dyCells);
    } else if (mode === "resize-outer") config.outerRadiusCells = Math.max(1, config.outerRadiusCells + Math.round((dxCells + dyCells) * 0.5));
    migrateCellBoundsForMode(config);
}
/** @param {CellBoundsDragMode} mode @param {number} worldX @param {number} worldY @param {import("../world/cellBoundsConfig.js").CellBoundsConfig} config */
export function applyCellBoundsDragAtPointer(mode, worldX, worldY, config) {
    if (config.boundsMode === "rect") return;
    const cellSize = gridSettings.cellSize;
    const center = getCellBoundsCenterWorld(config, cellSize);
    if (mode === "resize-outer") config.outerRadiusCells = Math.max(1, Math.round(Math.hypot(worldX - center.x, worldY - center.y) / cellSize));
    migrateCellBoundsForMode(config);
}
/** @param {CellBoundsDragMode | null} mode */
export function cellBoundsCursor(mode) {
    if (!mode) return "default";
    if (mode === "move") return "move";
    if (mode === "resize-outer") return "nwse-resize";
    if (mode === "resize-e" || mode === "resize-w") return "ew-resize";
    if (mode === "resize-n" || mode === "resize-s") return "ns-resize";
    return "nwse-resize";
}
