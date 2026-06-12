import { createAabb, minCornerAabbInto } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOriginInto } from "../../../Libraries/Spatial/grid/GridCoords.js";
/** @typedef {"rect" | "circle" | "donut"} CavernBoundsMode */
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} [out] */
export function getCavernBoundsAabbInto(out, config, cellSize) {
    if (config.boundsMode === "rect") return worldBoundsFromCellOriginInto(out, config.boundsCol, config.boundsRow, config.boundsCols, config.boundsRows, cellSize);
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = (config.centerCol + 0.5) * cellSize;
    const cy = (config.centerRow + 0.5) * cellSize;
    return minCornerAabbInto(out, cx - r, cy - r, r * 2, r * 2);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize */
export function getCavernBoundsAabb(config, cellSize) {
    return getCavernBoundsAabbInto(createAabb(), config, cellSize);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function getCavernInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize */
export function getCavernCenterWorld(config, cellSize) {
    if (config.boundsMode === "rect") return { x: (config.boundsCol + config.boundsCols * 0.5) * cellSize, y: (config.boundsRow + config.boundsRows * 0.5) * cellSize };
    return { x: (config.centerCol + 0.5) * cellSize, y: (config.centerRow + 0.5) * cellSize };
}
/**
 * Stamp bitmap extent for CA + occupancy.
 *
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} config
 */
export function getCavernStampExtent(config) {
    if (config.boundsMode === "rect")
        return { originCol: config.boundsCol, originRow: config.boundsRow, cols: Math.max(1, Math.round(config.boundsCols)), rows: Math.max(1, Math.round(config.boundsRows)) };
    const r = Math.max(1, Math.round(config.outerRadiusCells));
    return { originCol: config.centerCol - r, originRow: config.centerRow - r, cols: r * 2, rows: r * 2 };
}
/**
 * Zero CA cells outside the active shape (circle ring or filled circle).
 *
 * @param {Uint8Array} cells
 * @param {number} cols
 * @param {number} rows
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} config
 * @param {number} originCol
 * @param {number} originRow
 */
export function applyCavernShapeMask(cells, cols, rows, config, originCol, originRow) {
    if (config.boundsMode === "rect") return;
    const outerR = Math.max(1, config.outerRadiusCells);
    const innerR = getCavernInnerRadiusCells(config);
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const dist = Math.hypot(gc - config.centerCol, gr - config.centerRow);
            if (dist > outerR || dist < innerR) cells[lr * cols + lc] = 0;
        }
}
/**
 * @param {import("../state.js").TileLabGameState["viewport"]} viewport
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} config
 * @param {number} cellSize
 */
export function centerCavernBoundsOnViewport(viewport, config, cellSize) {
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
/** @param {import("../state.js").TileLabGameState["labPlayConfig"]} playConfig @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function syncCavernSizeFromPlayArea(playConfig, config) {
    if (config.boundsMode === "rect") {
        config.boundsCols = playConfig.playAreaCols;
        config.boundsRows = playConfig.playAreaRows;
        return;
    }
    config.outerRadiusCells = Math.max(1, Math.round(Math.min(playConfig.playAreaCols, playConfig.playAreaRows) / 2));
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function migrateCavernConfigForMode(config) {
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
    if (config.boundsMode === "donut") config.donutThicknessCells = Math.max(1, Math.min(config.donutThicknessCells ?? 4, config.outerRadiusCells - 1));
}
