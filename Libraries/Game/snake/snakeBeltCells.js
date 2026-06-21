import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
/**
 * Nav-walkable belt cells from an open-cell pool (same connectivity as snake explore).
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number }[]} openCells
 * @param {{ has(col: number, row: number): boolean }} navWalkable
 */
export function filterNavWalkableBeltCells(grid, openCells, navWalkable) {
    const beltCells = [];
    for (let i = 0; i < openCells.length; i++) {
        const cell = openCells[i];
        if (!navWalkable.has(cell.col, cell.row)) continue;
        if (!grid.hasFloorBelt(cell.col, cell.row)) continue;
        beltCells.push(cell);
    }
    return beltCells;
}
/**
 * @param {{ col: number, row: number }} origin
 * @param {{ col: number, row: number }[]} beltCells
 * @param {number} minTiles
 * @param {number} cols
 * @param {Set<number> | null} [excludeIndices]
 */
export function filterBeltCellsNearOrigin(origin, beltCells, minTiles, cols, excludeIndices = null) {
    const out = [];
    for (let i = 0; i < beltCells.length; i++) {
        const cell = beltCells[i];
        if (cell.col === origin.col && cell.row === origin.row) continue;
        if (excludeIndices?.has(colRowToIndex(cell.col, cell.row, cols))) continue;
        if (cellChebyshevDistance(origin.col, origin.row, cell.col, cell.row) < minTiles) continue;
        out.push(cell);
    }
    return out;
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ cells(): { col: number, row: number }[], has(col: number, row: number): boolean }} navWalkable
 * @param {{ col: number, row: number }} origin
 * @param {number} minTiles
 * @param {{ excludeIndices?: Set<number> | null, rng?: () => number }} [options]
 */
export function pickNavWalkableBeltCell(grid, navWalkable, origin, minTiles, { excludeIndices = null, rng = Math.random } = {}) {
    const beltCells = filterNavWalkableBeltCells(grid, navWalkable.cells(), navWalkable);
    const candidates = filterBeltCellsNearOrigin(origin, beltCells, minTiles, grid.cols, excludeIndices);
    return pickWalkableCell(candidates, { cols: grid.cols, excludeIndices, rng });
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ cells(): { col: number, row: number }[], has(col: number, row: number): boolean }} navWalkable
 * @param {{ excludeIndices?: Set<number> | null, rng?: () => number }} [options]
 */
export function pickNavWalkableBeltCellAny(grid, navWalkable, { excludeIndices = null, rng = Math.random } = {}) {
    const beltCells = filterNavWalkableBeltCells(grid, navWalkable.cells(), navWalkable);
    return pickWalkableCell(beltCells, { cols: grid.cols, excludeIndices, rng });
}
