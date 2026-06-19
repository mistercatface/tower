import { gridSettings } from "../../../Config/world.js";
import { stampRailWallsBatch } from "../../Sandbox/gridWallEdit.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
export function stampGlobalRailWalls(state, rails) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const gridRails = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const { col, row } = grid.worldToGrid(wall.col * cellSize, wall.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        gridRails.push({ col, row, side: wall.side, heightLevel: wall.heightLevel, thicknessLevel: wall.thicknessLevel });
    }
    stampRailWallsBatch(state, gridRails);
}
