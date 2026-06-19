import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
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
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number }} origin
 * @param {{ col: number, row: number }[]} beltCells
 * @param {number} minTiles
 * @param {Set<string> | null} [excludeKeys]
 */
export function filterBeltCellsNearOrigin(origin, beltCells, minTiles, excludeKeys = null) {
    const out = [];
    for (let i = 0; i < beltCells.length; i++) {
        const cell = beltCells[i];
        if (cell.col === origin.col && cell.row === origin.row) continue;
        if (excludeKeys?.has(`${cell.col},${cell.row}`)) continue;
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
 * @param {{ excludeKeys?: Set<string> | null, rng?: () => number }} [options]
 */
export function pickNavWalkableBeltCell(grid, navWalkable, origin, minTiles, { excludeKeys = null, rng = Math.random } = {}) {
    const beltCells = filterNavWalkableBeltCells(grid, navWalkable.cells(), navWalkable);
    const candidates = filterBeltCellsNearOrigin(origin, beltCells, minTiles, excludeKeys);
    return pickWalkableCell(candidates, { excludeKeys, rng });
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ cells(): { col: number, row: number }[], has(col: number, row: number): boolean }} navWalkable
 * @param {{ excludeKeys?: Set<string> | null, rng?: () => number }} [options]
 */
export function pickNavWalkableBeltCellAny(grid, navWalkable, { excludeKeys = null, rng = Math.random } = {}) {
    const beltCells = filterNavWalkableBeltCells(grid, navWalkable.cells(), navWalkable);
    return pickWalkableCell(beltCells, { excludeKeys, rng });
}
