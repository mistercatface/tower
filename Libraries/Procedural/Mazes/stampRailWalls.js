import { gridSettings } from "../../../Config/world.js";
import { stampRailWallsQuiet } from "../../Sandbox/gridWallEdit.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
export function stampGlobalRailWalls(state, rails, { commit = true } = {}) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const gridRails = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const col = grid.worldCol(wall.col * cellSize);
    const row = grid.worldRow(wall.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        gridRails.push({ col, row, side: wall.side, heightLevel: wall.heightLevel, thicknessLevel: wall.thicknessLevel });
    }
    const result = stampRailWallsQuiet(state, gridRails);
    if (!commit || !result.bounds) return result;
    commitGridNavEdit(state, result.bounds);
    return result;
}
