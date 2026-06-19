import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
export function walkableCellKey(col, row) {
    return `${col},${row}`;
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
export function pickWalkableCell(openCells, { excludeKeys = null, rng = Math.random } = {}) {
    const candidates = excludeKeys ? openCells.filter((cell) => !excludeKeys.has(walkableCellKey(cell.col, cell.row))) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickRandomWalkableCell(state, { excludeKeys = null, boundsConfig = state.editor.cavernConfig, rng = Math.random } = {}) {
    const openCells = collectWalkableCells(state, boundsConfig);
    return pickWalkableCell(openCells, { excludeKeys, rng });
}
