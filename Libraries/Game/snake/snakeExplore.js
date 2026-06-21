import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
export function collectSnakeWaypointCandidates(grid, originCol, originRow, minTiles, openCells) {
    const candidates = [];
    for (let i = 0; i < openCells.length; i++) {
        const cell = openCells[i];
        if (cell.col === originCol && cell.row === originRow) continue;
        if (cellChebyshevDistance(originCol, originRow, cell.col, cell.row) < minTiles) continue;
        candidates.push(cell);
    }
    return candidates;
}
export function resolveSnakeExploreCell(seeker, state, memory, rng, navWalkable) {
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
    const openCells = navWalkable.cells();
    const explorePick = { memory, openCells, rng, fringeRatio: config.spatialMemoryFringeRatio };
    let cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreMinTiles });
    if (!cell && config.exploreMinTiles > config.exploreFallbackMinTiles) cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreFallbackMinTiles });
    if (!cell) cell = pickWalkableCell(openCells, { cols: grid.cols, rng });
    if (cell && cell.col === col && cell.row === row) cell = pickWalkableCell(openCells, { cols: grid.cols, excludeIndices: new Set([colRowToIndex(col, row, grid.cols)]), rng });
    return cell;
}
