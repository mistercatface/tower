import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { forEachGlobalCellInMapGenBounds, isGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { walkableCellKey, pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
const CARDINALS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];
function resolveSnakePlayableBounds(state) {
    return state.sandbox.snakePlayableBounds ?? state.editor.cavernConfig;
}
export function isSnakeNavWalkableCell(grid, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    for (let i = 0; i < CARDINALS.length; i++) {
        const nc = col + CARDINALS[i][0];
        const nr = row + CARDINALS[i][1];
        if (grid.canStep(col, row, nc, nr) || grid.canStep(nc, nr, col, row)) return true;
    }
    return false;
}
function globalCellForGridCell(grid, col, row) {
    const cellSize = grid.cellSize;
    const { x, y } = grid.gridToWorld(col, row);
    return { globalCol: Math.round(x / cellSize), globalRow: Math.round(y / cellSize) };
}
export function filterSnakeWalkableCellsInBounds(cells, grid, boundsConfig) {
    const filtered = [];
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const { globalCol, globalRow } = globalCellForGridCell(grid, cell.col, cell.row);
        if (isGlobalCellInMapGenBounds(boundsConfig, globalCol, globalRow)) filtered.push(cell);
    }
    return filtered;
}
export function bakeSnakeWalkableCells(state) {
    const grid = state.obstacleGrid;
    const boundsConfig = resolveSnakePlayableBounds(state);
    const cellSize = grid.cellSize;
    const cells = [];
    const keys = new Set();
    forEachGlobalCellInMapGenBounds(boundsConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!isSnakeNavWalkableCell(grid, col, row)) return;
        const key = walkableCellKey(col, row);
        if (keys.has(key)) return;
        keys.add(key);
        cells.push({ col, row });
    });
    state.sandbox.snakeWalkableCells = { navEpoch: state.navigation.obstacleGeneration, cells, keys };
    return cells;
}
export function getSnakeWalkableCellIndex(state) {
    const navEpoch = state.navigation.obstacleGeneration;
    const cache = state.sandbox.snakeWalkableCells;
    if (cache && cache.navEpoch === navEpoch) return cache;
    bakeSnakeWalkableCells(state);
    return state.sandbox.snakeWalkableCells;
}
export function getSnakeWalkableCells(state) {
    return getSnakeWalkableCellIndex(state).cells;
}
export function isSnakeWalkableCell(state, col, row) {
    return getSnakeWalkableCellIndex(state).keys.has(walkableCellKey(col, row));
}
export function pickSnakeWalkableCell(state, { excludeKeys = null, boundsConfig = null, rng = Math.random } = {}) {
    let cells = getSnakeWalkableCells(state);
    if (boundsConfig) cells = filterSnakeWalkableCellsInBounds(cells, state.obstacleGrid, boundsConfig);
    return pickWalkableCell(cells, { excludeKeys, rng });
}
