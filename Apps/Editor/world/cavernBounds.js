import {
    centerCellBoundsOnViewport,
    getCellBoundsAabb,
    getCellBoundsAabbInto,
    getCellBoundsCenterWorld,
    getCellBoundsStampExtent,
    isGlobalCellInBounds,
    migrateCellBoundsForMode,
    syncCellBoundsSizeFromPlayArea,
} from "./cellBoundsConfig.js";
/** @typedef {"rect" | "circle" | "donut"} CavernBoundsMode */
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} [out] */
export function getCavernBoundsAabbInto(out, config, cellSize) {
    return getCellBoundsAabbInto(out, config, cellSize);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize */
export function getCavernBoundsAabb(config, cellSize) {
    return getCellBoundsAabb(config, cellSize);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function getCavernInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize */
export function getCavernCenterWorld(config, cellSize) {
    return getCellBoundsCenterWorld(config, cellSize);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function getCavernStampExtent(config) {
    return getCellBoundsStampExtent(config);
}
/**
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
/** @param {import("../state.js").TileLabGameState["viewport"]} viewport @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @param {number} cellSize */
export function centerCavernBoundsOnViewport(viewport, config, cellSize) {
    centerCellBoundsOnViewport(viewport, config, cellSize);
}
/** @param {import("../state.js").TileLabGameState["labPlayConfig"]} playConfig @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function syncCavernSizeFromPlayArea(playConfig, config) {
    syncCellBoundsSizeFromPlayArea(playConfig, config);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
export function migrateCavernConfigForMode(config) {
    migrateCellBoundsForMode(config);
    if (config.boundsMode === "donut") config.donutThicknessCells = Math.max(1, Math.min(config.donutThicknessCells ?? 4, config.outerRadiusCells - 1));
}
export { isGlobalCellInBounds as isCavernGlobalCellInBounds };
