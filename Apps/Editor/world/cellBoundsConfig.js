import { createAabb, minCornerAabbInto } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOriginInto } from "../../../Libraries/Spatial/grid/GridCoords.js";
/** @typedef {"rect" | "circle"} CellBoundsMode */
/** @typedef {{ boundsMode: CellBoundsMode, boundsCol: number, boundsRow: number, boundsCols: number, boundsRows: number, centerCol: number, centerRow: number, outerRadiusCells: number }} CellBoundsConfig */
/** @param {CellBoundsConfig} config @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} out @param {number} cellSize */
export function getCellBoundsAabbInto(out, config, cellSize) {
    if (config.boundsMode === "rect") return worldBoundsFromCellOriginInto(out, config.boundsCol, config.boundsRow, config.boundsCols, config.boundsRows, cellSize);
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = (config.centerCol + 0.5) * cellSize;
    const cy = (config.centerRow + 0.5) * cellSize;
    return minCornerAabbInto(out, cx - r, cy - r, r * 2, r * 2);
}
/** @param {CellBoundsConfig} config @param {number} cellSize */
export function getCellBoundsAabb(config, cellSize) {
    return getCellBoundsAabbInto(createAabb(), config, cellSize);
}
/** @param {CellBoundsConfig} config @param {number} cellSize */
export function getCellBoundsCenterWorld(config, cellSize) {
    if (config.boundsMode === "rect") return { x: (config.boundsCol + config.boundsCols * 0.5) * cellSize, y: (config.boundsRow + config.boundsRows * 0.5) * cellSize };
    return { x: (config.centerCol + 0.5) * cellSize, y: (config.centerRow + 0.5) * cellSize };
}
/** @param {CellBoundsConfig} config */
export function getCellBoundsStampExtent(config) {
    if (config.boundsMode === "rect")
        return { originCol: config.boundsCol, originRow: config.boundsRow, cols: Math.max(1, Math.round(config.boundsCols)), rows: Math.max(1, Math.round(config.boundsRows)) };
    const r = Math.max(1, Math.round(config.outerRadiusCells));
    return { originCol: config.centerCol - r, originRow: config.centerRow - r, cols: r * 2, rows: r * 2 };
}
/** @param {CellBoundsConfig} config @param {number} globalCol @param {number} globalRow */
export function isGlobalCellInBounds(config, globalCol, globalRow) {
    if (config.boundsMode === "rect")
        return globalCol >= config.boundsCol && globalCol < config.boundsCol + config.boundsCols && globalRow >= config.boundsRow && globalRow < config.boundsRow + config.boundsRows;
    return Math.hypot(globalCol - config.centerCol, globalRow - config.centerRow) <= Math.max(1, config.outerRadiusCells);
}
/** @param {CellBoundsConfig} config @param {(globalCol: number, globalRow: number) => void} fn */
export function forEachGlobalCellInBounds(config, fn) {
    const { originCol, originRow, cols, rows } = getCellBoundsStampExtent(config);
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            if (isGlobalCellInBounds(config, gc, gr)) fn(gc, gr);
        }
}
/** @param {import("../state.js").TileLabGameState["viewport"]} viewport @param {CellBoundsConfig} config @param {number} cellSize */
export function centerCellBoundsOnViewport(viewport, config, cellSize) {
    if (config.boundsMode === "rect") {
        const minX = viewport.x - (config.boundsCols * cellSize) / 2;
        const minY = viewport.y - (config.boundsRows * cellSize) / 2;
        config.boundsCol = Math.round(minX / cellSize);
        config.boundsRow = Math.round(minY / cellSize);
        return;
    }
    config.centerCol = Math.round(viewport.x / cellSize);
    config.centerRow = Math.round(viewport.y / cellSize);
}
/** @param {{ playAreaCols: number, playAreaRows: number }} playConfig @param {CellBoundsConfig} config */
export function syncCellBoundsSizeFromPlayArea(playConfig, config) {
    if (config.boundsMode === "rect") {
        config.boundsCols = playConfig.playAreaCols;
        config.boundsRows = playConfig.playAreaRows;
        return;
    }
    config.outerRadiusCells = Math.max(1, Math.round(Math.min(playConfig.playAreaCols, playConfig.playAreaRows) / 2));
}
/** @param {CellBoundsConfig} config */
export function migrateCellBoundsForMode(config) {
    if (config.boundsMode === "rect") {
        config.centerCol = config.boundsCol + Math.floor(config.boundsCols / 2);
        config.centerRow = config.boundsRow + Math.floor(config.boundsRows / 2);
        config.outerRadiusCells = Math.max(1, Math.round(Math.min(config.boundsCols, config.boundsRows) / 2));
        return;
    }
    const r = Math.max(1, config.outerRadiusCells);
    config.boundsCol = config.centerCol - r;
    config.boundsRow = config.centerRow - r;
    config.boundsCols = r * 2;
    config.boundsRows = r * 2;
}
