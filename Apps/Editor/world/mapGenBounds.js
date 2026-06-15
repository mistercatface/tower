import { createAabb, minCornerAabbInto } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOriginInto } from "../../../Libraries/Spatial/grid/GridCoords.js";
/** @typedef {"rect" | "circle" | "donut"} MapGenBoundsMode */
/** @typedef {{ boundsMode: MapGenBoundsMode, boundsCol: number, boundsRow: number, boundsCols: number, boundsRows: number, centerCol: number, centerRow: number, outerRadiusCells: number, donutThicknessCells: number }} MapGenBoundsConfig */
/** @typedef {{ aabb: import("../../../Libraries/Math/Aabb2D.js").Aabb2D, boundsMode: string, boundsCol: number, boundsRow: number, boundsCols: number, boundsRows: number, centerCol: number, centerRow: number, outerRadiusCells: number, donutThicknessCells: number }} MapGenBoundsAabbCache */
/** @type {readonly ["cavern", "rail", "erase"]} */
export const MAP_GEN_KINDS = ["cavern", "rail", "erase"];
export const MAP_GEN_OVERLAY_COLORS = { cavern: "#ff9800", rail: "#e040fb", erase: "#f44336" };
/** @returns {MapGenBoundsConfig} */
export function createDefaultMapGenBoundsConfig() {
    return { boundsMode: "rect", boundsCol: -8, boundsRow: -8, boundsCols: 32, boundsRows: 32, centerCol: 8, centerRow: 8, outerRadiusCells: 16, donutThicknessCells: 4 };
}
/** @returns {MapGenBoundsAabbCache} */
export function createMapGenBoundsAabbCache() {
    return { aabb: createAabb(), boundsMode: "", boundsCol: NaN, boundsRow: NaN, boundsCols: NaN, boundsRows: NaN, centerCol: NaN, centerRow: NaN, outerRadiusCells: NaN, donutThicknessCells: NaN };
}
/** @param {MapGenBoundsConfig} config */
export function getInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
/** @param {MapGenBoundsConfig} config @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} out @param {number} cellSize */
export function getMapGenBoundsAabbInto(out, config, cellSize) {
    if (config.boundsMode === "rect") return worldBoundsFromCellOriginInto(out, config.boundsCol, config.boundsRow, config.boundsCols, config.boundsRows, cellSize);
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = (config.centerCol + 0.5) * cellSize;
    const cy = (config.centerRow + 0.5) * cellSize;
    return minCornerAabbInto(out, cx - r, cy - r, r * 2, r * 2);
}
/** @param {MapGenBoundsConfig} config @param {number} cellSize */
export function getMapGenBoundsAabb(config, cellSize) {
    return getMapGenBoundsAabbInto(createAabb(), config, cellSize);
}
/** @param {MapGenBoundsConfig} config @param {number} cellSize */
export function getMapGenBoundsCenterWorld(config, cellSize) {
    if (config.boundsMode === "rect") return { x: (config.boundsCol + config.boundsCols * 0.5) * cellSize, y: (config.boundsRow + config.boundsRows * 0.5) * cellSize };
    return { x: (config.centerCol + 0.5) * cellSize, y: (config.centerRow + 0.5) * cellSize };
}
/** @param {MapGenBoundsConfig} config */
export function getMapGenBoundsStampExtent(config) {
    if (config.boundsMode === "rect")
        return { originCol: config.boundsCol, originRow: config.boundsRow, cols: Math.max(1, Math.round(config.boundsCols)), rows: Math.max(1, Math.round(config.boundsRows)) };
    const r = Math.max(1, Math.round(config.outerRadiusCells));
    return { originCol: config.centerCol - r, originRow: config.centerRow - r, cols: r * 2, rows: r * 2 };
}
/** @param {MapGenBoundsConfig} config @param {number} globalCol @param {number} globalRow */
export function isGlobalCellInMapGenBounds(config, globalCol, globalRow) {
    if (config.boundsMode === "rect")
        return globalCol >= config.boundsCol && globalCol < config.boundsCol + config.boundsCols && globalRow >= config.boundsRow && globalRow < config.boundsRow + config.boundsRows;
    const dist = Math.hypot(globalCol - config.centerCol, globalRow - config.centerRow);
    if (config.boundsMode === "circle") return dist <= config.outerRadiusCells;
    const innerR = getInnerRadiusCells(config);
    return dist <= config.outerRadiusCells && dist >= innerR;
}
/** @param {MapGenBoundsConfig} config @param {(globalCol: number, globalRow: number) => void} fn */
export function forEachGlobalCellInMapGenBounds(config, fn) {
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            if (isGlobalCellInMapGenBounds(config, gc, gr)) fn(gc, gr);
        }
}
/** @param {Uint8Array} cells @param {number} cols @param {number} rows @param {MapGenBoundsConfig} config @param {number} originCol @param {number} originRow */
export function applyMapGenShapeMask(cells, cols, rows, config, originCol, originRow) {
    if (config.boundsMode === "rect") return;
    const outerR = Math.max(1, config.outerRadiusCells);
    const innerR = getInnerRadiusCells(config);
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const dist = Math.hypot(gc - config.centerCol, gr - config.centerRow);
            if (dist > outerR || dist < innerR) cells[lr * cols + lc] = 0;
        }
}
/** @param {import("../state.js").TileLabGameState["viewport"]} viewport @param {MapGenBoundsConfig} config @param {number} cellSize */
export function centerMapGenBoundsOnViewport(viewport, config, cellSize) {
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
/** @param {{ playAreaCols: number, playAreaRows: number }} playConfig @param {MapGenBoundsConfig} config */
export function syncMapGenBoundsSizeFromPlayArea(playConfig, config) {
    if (config.boundsMode === "rect") {
        config.boundsCols = playConfig.playAreaCols;
        config.boundsRows = playConfig.playAreaRows;
        return;
    }
    config.outerRadiusCells = Math.max(1, Math.round(Math.min(playConfig.playAreaCols, playConfig.playAreaRows) / 2));
}
/** @param {MapGenBoundsConfig} config */
export function migrateMapGenBoundsForMode(config) {
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
    if (config.boundsMode === "donut") config.donutThicknessCells = Math.max(1, Math.min(config.donutThicknessCells, config.outerRadiusCells - 1));
}
/** @param {MapGenBoundsAabbCache} cache @param {MapGenBoundsConfig} config */
function mapGenBoundsCacheMatches(cache, config) {
    return (
        cache.boundsMode === config.boundsMode &&
        cache.boundsCol === config.boundsCol &&
        cache.boundsRow === config.boundsRow &&
        cache.boundsCols === config.boundsCols &&
        cache.boundsRows === config.boundsRows &&
        cache.centerCol === config.centerCol &&
        cache.centerRow === config.centerRow &&
        cache.outerRadiusCells === config.outerRadiusCells &&
        cache.donutThicknessCells === config.donutThicknessCells
    );
}
/** @param {MapGenBoundsAabbCache} cache @param {MapGenBoundsConfig} config @param {number} cellSize */
export function refreshMapGenBoundsAabb(cache, config, cellSize) {
    if (mapGenBoundsCacheMatches(cache, config)) return;
    cache.boundsMode = config.boundsMode;
    cache.boundsCol = config.boundsCol;
    cache.boundsRow = config.boundsRow;
    cache.boundsCols = config.boundsCols;
    cache.boundsRows = config.boundsRows;
    cache.centerCol = config.centerCol;
    cache.centerRow = config.centerRow;
    cache.outerRadiusCells = config.outerRadiusCells;
    cache.donutThicknessCells = config.donutThicknessCells;
    getMapGenBoundsAabbInto(cache.aabb, config, cellSize);
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState} editor @param {typeof MAP_GEN_KINDS[number]} kind */
export function getMapGenBoundsConfig(editor, kind) {
    if (kind === "cavern") return editor.cavernConfig;
    if (kind === "rail") return editor.railConfig;
    return editor.eraseConfig;
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState} editor @param {typeof MAP_GEN_KINDS[number]} kind */
export function getMapGenBoundsAabbCache(editor, kind) {
    return editor.mapBoundsPreview[kind];
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState} editor @param {number} cellSize */
export function refreshAllMapGenBoundsPreviews(editor, cellSize) {
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        refreshMapGenBoundsAabb(getMapGenBoundsAabbCache(editor, kind), getMapGenBoundsConfig(editor, kind), cellSize);
    }
}
/**
 * @param {import("../state.js").TileLabGameState["viewport"]} viewport
 * @param {{ playAreaCols: number, playAreaRows: number }} playConfig
 * @param {MapGenBoundsConfig} config
 * @param {number} cellSize
 * @param {{ center?: boolean, syncSizeFromPlay?: boolean }} [options]
 */
export function syncMapGenBoundsFromPlay(viewport, playConfig, config, cellSize, { center = true, syncSizeFromPlay = false } = {}) {
    if (syncSizeFromPlay) syncMapGenBoundsSizeFromPlayArea(playConfig, config);
    if (center) centerMapGenBoundsOnViewport(viewport, config, cellSize);
}
