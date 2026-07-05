import { createAabb, minCornerAabbInto } from "../Math/math.js";
import {  worldBoundsFromCellOriginInto  } from "../Spatial/spatial.js";
export const MAP_GEN_KINDS = ["cavern", "rail", "railMaze", "erase"];
export const MAP_GEN_OVERLAY_COLORS = { cavern: "#ff9800", rail: "#e040fb", railMaze: "#ba68c8", erase: "#f44336" };
export function createDefaultMapGenBoundsConfig() {
    return { boundsMode: "rect", boundsIdx: 0, boundsCols: 32, boundsRows: 32, centerIdx: 0, outerRadiusCells: 16, donutThicknessCells: 4 };
}
export function createMapGenBoundsAabbCache() {
    return { aabb: createAabb(), boundsMode: "", boundsIdx: -1, boundsCols: NaN, boundsRows: NaN, centerIdx: -1, outerRadiusCells: NaN, donutThicknessCells: NaN };
}
export function getInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
export function getMapGenBoundsAabbInto(grid, out, config, cellSize) {
    if (config.boundsMode === "rect") {
        const minX = grid.gridCenterXByIdx(config.boundsIdx) - cellSize * 0.5;
        const minY = grid.gridCenterYByIdx(config.boundsIdx) - cellSize * 0.5;
        return minCornerAabbInto(out, minX, minY, config.boundsCols * cellSize, config.boundsRows * cellSize);
    }
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = grid.gridCenterXByIdx(config.centerIdx);
    const cy = grid.gridCenterYByIdx(config.centerIdx);
    return minCornerAabbInto(out, cx - r, cy - r, r * 2, r * 2);
}
export function getMapGenBoundsAabb(grid, config, cellSize) {
    return getMapGenBoundsAabbInto(grid, createAabb(), config, cellSize);
}
export function getMapGenBoundsCenterWorld(grid, config, cellSize) {
    if (config.boundsMode === "rect")
        return { x: grid.gridCenterXByIdx(config.boundsIdx) + (config.boundsCols - 1) * cellSize * 0.5, y: grid.gridCenterYByIdx(config.boundsIdx) + (config.boundsRows - 1) * cellSize * 0.5 };
    return { x: grid.gridCenterXByIdx(config.centerIdx), y: grid.gridCenterYByIdx(config.centerIdx) };
}
export function getMapGenBoundsStampExtent(grid, config) {
    if (config.boundsMode === "rect") return { originIdx: config.boundsIdx, cols: Math.max(1, Math.round(config.boundsCols)), rows: Math.max(1, Math.round(config.boundsRows)) };
    const r = Math.max(1, Math.round(config.outerRadiusCells));
    const originIdx = config.centerIdx - r - r * grid.cols;
    return { originIdx, cols: r * 2, rows: r * 2 };
}
export function isIdxInMapGenBounds(config, grid, idx) {
    if (config.boundsMode === "rect") {
        const dCol = (idx % grid.cols) - (config.boundsIdx % grid.cols);
        const dRow = ((idx / grid.cols) | 0) - ((config.boundsIdx / grid.cols) | 0);
        return dCol >= 0 && dCol < config.boundsCols && dRow >= 0 && dRow < config.boundsRows;
    }
    const dCol = (idx % grid.cols) - (config.centerIdx % grid.cols);
    const dRow = ((idx / grid.cols) | 0) - ((config.centerIdx / grid.cols) | 0);
    const dist = Math.hypot(dCol, dRow);
    if (config.boundsMode === "circle") return dist <= config.outerRadiusCells;
    const innerR = getInnerRadiusCells(config);
    return dist <= config.outerRadiusCells && dist >= innerR;
}
export function forEachGlobalCellInMapGenBounds(grid, config, fn) {
    const { originIdx, cols, rows } = getMapGenBoundsStampExtent(grid, config);
    for (let i = 0; i < rows; i++) {
        const rowStartIdx = originIdx + i * grid.cols;
        for (let j = 0; j < cols; j++) {
            const idx = rowStartIdx + j;
            if (idx >= 0 && idx < grid.grid.length && isIdxInMapGenBounds(config, grid, idx)) fn(idx);
        }
    }
}
export function applyMapGenShapeMask(grid, cells, cols, rows, config, originIdx) {
    if (config.boundsMode === "rect") return;
    const outerR = Math.max(1, config.outerRadiusCells);
    const innerR = getInnerRadiusCells(config);
    const baseCol = originIdx % grid.cols;
    const baseRow = (originIdx / grid.cols) | 0;
    const centerCol = config.centerIdx % grid.cols;
    const centerRow = (config.centerIdx / grid.cols) | 0;
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const c = baseCol + lc;
            const r = baseRow + lr;
            const dist = Math.hypot(c - centerCol, r - centerRow);
            if (dist > outerR || dist < innerR) cells[lr * cols + lc] = 0;
        }
}
export function centerMapGenBoundsOnViewport(grid, viewport, config, cellSize) {
    const colOffset = Math.round(grid.minX / cellSize);
    const rowOffset = Math.round(grid.minY / cellSize);
    if (config.boundsMode === "rect") {
        const minX = viewport.x - (config.boundsCols * cellSize) / 2;
        const minY = viewport.y - (config.boundsRows * cellSize) / 2;
        const c = Math.round(minX / cellSize) - colOffset;
        const r = Math.round(minY / cellSize) - rowOffset;
        config.boundsIdx = grid.idx(c, r);
        return;
    }
    const c = Math.round(viewport.x / cellSize) - colOffset;
    const r = Math.round(viewport.y / cellSize) - rowOffset;
    config.centerIdx = grid.idx(c, r);
}
export function syncMapGenBoundsSizeFromPlayArea(playConfig, config) {
    if (config.boundsMode === "rect") {
        config.boundsCols = playConfig.playAreaCols;
        config.boundsRows = playConfig.playAreaRows;
        return;
    }
    config.outerRadiusCells = Math.max(1, Math.round(Math.min(playConfig.playAreaCols, playConfig.playAreaRows) / 2));
}
export function migrateMapGenBoundsForMode(grid, config) {
    if (config.boundsMode === "rect") {
        const boundsCol = config.boundsIdx % grid.cols;
        const boundsRow = (config.boundsIdx / grid.cols) | 0;
        const centerCol = boundsCol + Math.floor(config.boundsCols / 2);
        const centerRow = boundsRow + Math.floor(config.boundsRows / 2);
        config.centerIdx = grid.idx(centerCol, centerRow);
        config.outerRadiusCells = Math.max(1, Math.round(Math.min(config.boundsCols, config.boundsRows) / 2));
        return;
    }
    const r = Math.max(1, config.outerRadiusCells);
    const centerCol = config.centerIdx % grid.cols;
    const centerRow = (config.centerIdx / grid.cols) | 0;
    config.boundsIdx = grid.idx(centerCol - r, centerRow - r);
    config.boundsCols = r * 2;
    config.boundsRows = r * 2;
    if (config.boundsMode === "donut") config.donutThicknessCells = Math.max(1, Math.min(config.donutThicknessCells, config.outerRadiusCells - 1));
}
function mapGenBoundsCacheMatches(cache, config) {
    return (
        cache.boundsMode === config.boundsMode &&
        cache.boundsIdx === config.boundsIdx &&
        cache.boundsCols === config.boundsCols &&
        cache.boundsRows === config.boundsRows &&
        cache.centerIdx === config.centerIdx &&
        cache.outerRadiusCells === config.outerRadiusCells &&
        cache.donutThicknessCells === config.donutThicknessCells
    );
}
export function refreshMapGenBoundsAabb(grid, cache, config, cellSize) {
    if (mapGenBoundsCacheMatches(cache, config)) return;
    cache.boundsMode = config.boundsMode;
    cache.boundsIdx = config.boundsIdx;
    cache.boundsCols = config.boundsCols;
    cache.boundsRows = config.boundsRows;
    cache.centerIdx = config.centerIdx;
    cache.outerRadiusCells = config.outerRadiusCells;
    cache.donutThicknessCells = config.donutThicknessCells;
    getMapGenBoundsAabbInto(grid, cache.aabb, config, cellSize);
}
export function getMapGenBoundsConfig(editor, kind) {
    if (kind === "cavern") return editor.cavernConfig;
    if (kind === "rail") return editor.railConfig;
    if (kind === "railMaze") return editor.railMazeConfig;
    return editor.eraseConfig;
}
export function getMapGenBoundsAabbCache(editor, kind) {
    return editor.mapBoundsPreview[kind];
}
export function refreshAllMapGenBoundsPreviews(grid, editor, cellSize) {
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        refreshMapGenBoundsAabb(grid, getMapGenBoundsAabbCache(editor, kind), getMapGenBoundsConfig(editor, kind), cellSize);
    }
}
export function syncMapGenBoundsFromPlay(grid, viewport, playConfig, config, cellSize, { center = true, syncSizeFromPlay = false } = {}) {
    if (syncSizeFromPlay) syncMapGenBoundsSizeFromPlayArea(playConfig, config);
    if (center) centerMapGenBoundsOnViewport(grid, viewport, config, cellSize);
}
export function registerMapGenBoundsGridExpansionListener(state) {
    const grid = state.obstacleGrid;
    if (grid._mapGenExpansionListenerRegistered) return;
    grid._mapGenExpansionListenerRegistered = true;
    const oldOnBoundsExpansion = grid.onBoundsExpansion;
    grid.onBoundsExpansion = (colOffset, rowOffset, oldCols, oldRows) => {
        if (oldOnBoundsExpansion) oldOnBoundsExpansion(colOffset, rowOffset, oldCols, oldRows);
        for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
            const kind = MAP_GEN_KINDS[i];
            const config = getMapGenBoundsConfig(state.editor, kind);
            if (!config) continue;
            if (config.boundsMode === "rect") {
                const oldCol = config.boundsIdx % oldCols;
                const oldRow = (config.boundsIdx / oldCols) | 0;
                config.boundsIdx = grid.idx(oldCol + colOffset, oldRow + rowOffset);
            } else {
                const oldCol = config.centerIdx % oldCols;
                const oldRow = (config.centerIdx / oldCols) | 0;
                config.centerIdx = grid.idx(oldCol + colOffset, oldRow + rowOffset);
            }
            migrateMapGenBoundsForMode(grid, config);
        }
    };
}
