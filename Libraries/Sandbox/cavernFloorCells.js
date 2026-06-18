import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { forEachGlobalCellInMapGenBounds } from "./mapGenBounds.js";
export function cavernCellKey(col, row) {
    return `${col},${row}`;
}
export function collectOpenCavernCells(state, config = state.editor.cavernConfig) {
    const grid = state.obstacleGrid;
    const epoch = state.navigation?.obstacleGeneration ?? 0;
    const cache = state.sandbox._openCavernCellsCache;
    if (cache && cache.epoch === epoch && cache.config === config) return cache.cells;
    const cellSize = grid.cellSize;
    const open = [];
    forEachGlobalCellInMapGenBounds(config, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (grid.isBlocked(col, row)) return;
        open.push({ col, row });
    });
    state.sandbox._openCavernCellsCache = { epoch, config, cells: open };
    return open;
}
export function pickOpenCavernCell(openCells, { excludeKeys = null, rng = Math.random } = {}) {
    const candidates = excludeKeys ? openCells.filter((cell) => !excludeKeys.has(cavernCellKey(cell.col, cell.row))) : openCells;
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
}
export function pickRandomOpenCavernCell(state, { excludeKeys = null, config = state.editor.cavernConfig, rng = Math.random } = {}) {
    const openCells = collectOpenCavernCells(state, config);
    return pickOpenCavernCell(openCells, { excludeKeys, rng });
}
