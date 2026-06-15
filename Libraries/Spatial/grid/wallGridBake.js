import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
export function clearWallCells(grid, cols, bounds) {
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (_col, _row, idx) => {
        grid[idx] = 0;
    });
}
