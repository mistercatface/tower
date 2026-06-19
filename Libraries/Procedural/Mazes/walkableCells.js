import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { isNavWalkableCell } from "../../Spatial/grid/navWalkableCell.js";
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
function bakeNavWalkableCellIndex(state, boundsConfig) {
    const grid = state.obstacleGrid;
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cellSize = grid.cellSize;
    const cells = [];
    const keys = new Set();
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!isNavWalkableCell(grid, col, row)) return;
        const key = walkableCellKey(col, row);
        if (keys.has(key)) return;
        keys.add(key);
        cells.push({ col, row });
    });
    state.sandbox._navWalkableCellsCache = { epoch, boundsConfig, cells, keys };
    return state.sandbox._navWalkableCellsCache;
}
export function collectNavWalkableCells(state, boundsConfig = state.editor.cavernConfig) {
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._navWalkableCellsCache;
    if (cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig) return cache.cells;
    return bakeNavWalkableCellIndex(state, boundsConfig).cells;
}
export function getNavWalkableCellIndex(state, boundsConfig = state.editor.cavernConfig) {
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._navWalkableCellsCache;
    if (cache && cache.epoch === epoch && cache.boundsConfig === boundsConfig) return cache;
    return bakeNavWalkableCellIndex(state, boundsConfig);
}
export function getNavWalkableCells(state, boundsConfig = state.editor.cavernConfig) {
    return getNavWalkableCellIndex(state, boundsConfig).cells;
}
export function isNavWalkableCellAt(state, col, row, boundsConfig = state.editor.cavernConfig) {
    return getNavWalkableCellIndex(state, boundsConfig).keys.has(walkableCellKey(col, row));
}
export function pickWalkableCell(openCells, { excludeKeys = null, rng = Math.random } = {}) {
    const candidates = excludeKeys ? openCells.filter((cell) => !excludeKeys.has(walkableCellKey(cell.col, cell.row))) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickNavWalkableCell(state, { boundsConfig = state.editor.cavernConfig, excludeKeys = null, filterBoundsConfig = null, rng = Math.random } = {}) {
    let cells = getNavWalkableCells(state, boundsConfig);
    if (filterBoundsConfig) cells = filterWalkableCellsInBounds(cells, state.obstacleGrid, filterBoundsConfig);
    return pickWalkableCell(cells, { excludeKeys, rng });
}
export function createNavWalkableAccess(state, boundsConfig) {
    return {
        rebake() {
            collectNavWalkableCells(state, boundsConfig);
            return this.cells();
        },
        cells() {
            return getNavWalkableCells(state, boundsConfig);
        },
        has(col, row) {
            return isNavWalkableCellAt(state, col, row, boundsConfig);
        },
        pick({ excludeKeys = null, filterBoundsConfig = null, rng = Math.random } = {}) {
            return pickNavWalkableCell(state, { boundsConfig, excludeKeys, filterBoundsConfig, rng });
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
