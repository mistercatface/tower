import { cellInRect, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { floodConnectedNavWalkableCells, isNavWalkableCell } from "../../Spatial/grid/navWalkableCell.js";
import { forEachGlobalCellInMapGenBounds, isGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { createNavWalkableCandidateMask, createNavWalkableReachedMask, readNavWalkableFlag, writeNavWalkableFlags } from "./navWalkableIndex.js";
export function walkableCellKey(col, row) {
    return `${col},${row}`;
}
function globalCellForGridCell(grid, col, row) {
    const cellSize = grid.cellSize;
    const { x, y } = grid.gridToWorld(col, row);
    return { globalCol: Math.round(x / cellSize), globalRow: Math.round(y / cellSize) };
}
export function filterWalkableCellsInBounds(cells, grid, boundsConfig) {
    const filtered = [];
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const { globalCol, globalRow } = globalCellForGridCell(grid, cell.col, cell.row);
        if (isGlobalCellInMapGenBounds(boundsConfig, globalCol, globalRow)) filtered.push(cell);
    }
    return filtered;
}
export function collectWalkableCells(state, boundsConfig = state.editor.cavernConfig) {
    const grid = state.obstacleGrid;
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._walkableCellsCache;
    if (cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig) return cache.cells;
    const cellSize = grid.cellSize;
    const open = [];
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (grid.isBlocked(col, row)) return;
        open.push({ col, row });
    });
    state.sandbox._walkableCellsCache = { epoch, boundsConfig, cells: open };
    return open;
}
function ensureNavWalkableBuffers(cache, grid) {
    const { cols, rows } = grid;
    const size = cols * rows;
    if (!cache.flags || cache.flags.length !== size || cache.cols !== cols || cache.rows !== rows) {
        cache.flags = new Uint8Array(size);
        cache.candidateMask = new Uint8Array(size);
        cache.reachedMask = new Uint8Array(size);
        cache.cols = cols;
        cache.rows = rows;
    }
    return cache;
}
function bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds = null) {
    const grid = state.obstacleGrid;
    const gridNavContext = state.navigation.gridNavContext;
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cellSize = grid.cellSize;
    const candidates = [];
    const seen = new Uint8Array(grid.cols * grid.rows);
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!isNavWalkableCell(grid, gridNavContext, col, row)) return;
        const idx = colRowToIndex(col, row, grid.cols);
        if (seen[idx]) return;
        seen[idx] = 1;
        candidates.push({ col, row });
    });
    let seedCells = candidates;
    if (floodSeedBounds) {
        const seeded = filterWalkableCellsInBounds(candidates, grid, floodSeedBounds);
        if (seeded.length) seedCells = seeded;
    }
    const prior = state.sandbox._navWalkableCellsCache;
    const cache = ensureNavWalkableBuffers(
        { epoch, boundsConfig, floodSeedBounds, cells: [], flags: prior?.flags, candidateMask: prior?.candidateMask, reachedMask: prior?.reachedMask, cols: prior?.cols, rows: prior?.rows },
        grid,
    );
    const candidateMask = createNavWalkableCandidateMask(grid, candidates, cache.candidateMask);
    const reachedMask = createNavWalkableReachedMask(grid.cols, grid.rows, cache.reachedMask);
    const cells = candidates.length ? floodConnectedNavWalkableCells(grid, gridNavContext, candidates, candidateMask, grid.cols, grid.rows, seedCells, reachedMask) : [];
    writeNavWalkableFlags(cache.flags, grid.cols, cells);
    cache.cells = cells;
    cache.candidateMask = candidateMask;
    cache.reachedMask = reachedMask;
    state.sandbox._navWalkableCellsCache = cache;
    return cache;
}
function navWalkableCacheHit(cache, epoch, boundsConfig, floodSeedBounds) {
    return cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig && cache.floodSeedBounds === floodSeedBounds;
}
export function collectNavWalkableCells(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._navWalkableCellsCache;
    if (navWalkableCacheHit(cache, epoch, boundsConfig, floodSeedBounds)) return cache.cells;
    return bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
}
export function getNavWalkableCellIndex(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._navWalkableCellsCache;
    if (navWalkableCacheHit(cache, epoch, boundsConfig, floodSeedBounds)) return cache;
    return bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
}
export function getNavWalkableCells(state, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    return getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).cells;
}
export function isNavWalkableCellAt(state, col, row, boundsConfig = state.editor.cavernConfig, floodSeedBounds = null) {
    const index = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
    if (!cellInRect(col, row, index.cols, index.rows)) return false;
    return readNavWalkableFlag(index.flags, index.cols, col, row);
}
/**
 * Rebake the cached nav-walkable index after navigation epoch advances (e.g. wall edit).
 * No-op when no snake/nav bounds cache exists yet.
 * @param {object} state
 */
export function patchNavWalkableCellIndex(state) {
    const cache = state.sandbox._navWalkableCellsCache;
    if (!cache?.boundsConfig) return null;
    return bakeNavWalkableCellIndex(state, cache.boundsConfig, cache.floodSeedBounds);
}
export function pickWalkableCell(openCells, { excludeKeys = null, rng = Math.random } = {}) {
    const candidates = excludeKeys ? openCells.filter((cell) => !excludeKeys.has(walkableCellKey(cell.col, cell.row))) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickNavWalkableCell(state, { boundsConfig = state.editor.cavernConfig, floodSeedBounds = null, excludeKeys = null, filterBoundsConfig = null, rng = Math.random } = {}) {
    let cells = getNavWalkableCells(state, boundsConfig, floodSeedBounds);
    if (filterBoundsConfig) cells = filterWalkableCellsInBounds(cells, state.obstacleGrid, filterBoundsConfig);
    return pickWalkableCell(cells, { excludeKeys, rng });
}
export function createNavWalkableAccess(state, boundsConfig, { floodSeedBounds = null } = {}) {
    let live = null;
    const isLive = () => {
        if (!live) return false;
        const epoch = state.navigation?.obstacleGeneration ?? 0;
        return navWalkableCacheHit(live, epoch, boundsConfig, floodSeedBounds);
    };
    const ensure = () => {
        if (!isLive()) live = getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
        return live;
    };
    return {
        rebake() {
            live = bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds);
            return live.cells;
        },
        cells() {
            return ensure().cells;
        },
        has(col, row) {
            const index = ensure();
            if (!cellInRect(col, row, index.cols, index.rows)) return false;
            return readNavWalkableFlag(index.flags, index.cols, col, row);
        },
        pick({ excludeKeys = null, filterBoundsConfig = null, rng = Math.random } = {}) {
            return pickNavWalkableCell(state, { boundsConfig, floodSeedBounds, excludeKeys, filterBoundsConfig, rng });
        },
        filterInBounds(filterBoundsConfig) {
            return filterWalkableCellsInBounds(this.cells(), state.obstacleGrid, filterBoundsConfig);
        },
    };
}
export function pickRandomWalkableCell(state, { excludeKeys = null, boundsConfig = state.editor.cavernConfig, rng = Math.random } = {}) {
    const openCells = collectWalkableCells(state, boundsConfig);
    return pickWalkableCell(openCells, { excludeKeys, rng });
}
