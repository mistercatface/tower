import { walkableCellKey, collectWalkableCells, pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function resolveSnakeExploreCell(seeker, state, memory, rng) {
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(seeker.x, seeker.y);
    const openCells = collectWalkableCells(state);
    const explorePick = { memory, openCells, rng, fringeRatio: config.spatialMemoryFringeRatio };
    let cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreMinTiles });
    if (!cell && config.exploreMinTiles > config.exploreFallbackMinTiles) cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreFallbackMinTiles });
    if (!cell) cell = pickWalkableCell(openCells, { rng });
    if (cell && cell.col === col && cell.row === row) cell = pickWalkableCell(openCells, { excludeKeys: new Set([walkableCellKey(col, row)]), rng });
    return cell;
}
