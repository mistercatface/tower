import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { floodConnectedNavWalkableCells, isNavWalkableCell } from "../../Spatial/grid/navWalkableCell.js";
import { forEachGlobalCellInMapGenBounds, isGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
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
function bakeNavWalkableCellIndex(state, boundsConfig, floodSeedBounds = null) {
    const grid = state.obstacleGrid;
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cellSize = grid.cellSize;
    const candidates = [];
    const candidateKeys = new Set();
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!isNavWalkableCell(grid, col, row)) return;
        const key = walkableCellKey(col, row);
        if (candidateKeys.has(key)) return;
        candidateKeys.add(key);
        candidates.push({ col, row });
    });
    let seedCells = candidates;
    if (floodSeedBounds) {
        const seeded = filterWalkableCellsInBounds(candidates, grid, floodSeedBounds);
        if (seeded.length) seedCells = seeded;
    }
    const cells = candidates.length ? floodConnectedNavWalkableCells(grid, candidates, candidateKeys, seedCells) : [];
    const keys = new Set();
    for (let i = 0; i < cells.length; i++) keys.add(walkableCellKey(cells[i].col, cells[i].row));
    state.sandbox._navWalkableCellsCache = { epoch, boundsConfig, floodSeedBounds, cells, keys };
    return state.sandbox._navWalkableCellsCache;
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
    return getNavWalkableCellIndex(state, boundsConfig, floodSeedBounds).keys.has(walkableCellKey(col, row));
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
    return {
        rebake() {
            collectNavWalkableCells(state, boundsConfig, floodSeedBounds);
            return this.cells();
        },
        cells() {
            return getNavWalkableCells(state, boundsConfig, floodSeedBounds);
        },
        has(col, row) {
            return isNavWalkableCellAt(state, col, row, boundsConfig, floodSeedBounds);
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
