import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
export function resolveSnakeExploreCell(seeker, state, memory, rng, navWalkable) {
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const col = grid.worldCol(seeker.x);
    const row = grid.worldRow(seeker.y);
    const openCells = navWalkable.cells();
    const explorePick = { memory, openCells, rng };
    let cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreMinTiles });
    if (!cell && config.exploreMinTiles > config.exploreFallbackMinTiles) cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: config.exploreFallbackMinTiles });
    if (!cell) {
        console.log("[snake] explore destination fell back to random walkable cell");
        cell = pickWalkableCell(openCells, { cols: grid.cols, rng });
    }
    if (cell && cell.col === col && cell.row === row) cell = pickWalkableCell(openCells, { cols: grid.cols, excludeIndices: new Set([colRowToIndex(col, row, grid.cols)]), rng });
    return cell;
}
