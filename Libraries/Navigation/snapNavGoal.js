import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltEntryEdgeWorldPoint, isFloorBeltCell } from "../Spatial/grid/FloorCell.js";
import { createNavGraphView, snapNavGraphGoalCell } from "./navGraph.js";
/**
 * Snap a grid path goal for directed topology (belt entry mouth).
 * Non-belt targets pass through; belt targets upstream unless the agent is already at the entry cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow) {
    return snapNavGraphGoalCell(createNavGraphView(grid), fromCol, fromRow, targetCol, targetRow);
}
/**
 * Snap a world-space steer/path goal — cell snap when upstream, entry-edge point when targeting a belt cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalWorld(grid, fromX, fromY, targetX, targetY) {
    const { col: fromCol, row: fromRow } = grid.worldToGrid(fromX, fromY);
    const { col: targetCol, row: targetRow } = grid.worldToGrid(targetX, targetY);
    if (!cellInRect(targetCol, targetRow, grid.cols, grid.rows)) return { x: targetX, y: targetY };
    const snapped = snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow);
    if (snapped.col !== targetCol || snapped.row !== targetRow) return grid.gridToWorld(snapped.col, snapped.row);
    if (!isFloorBeltCell(grid, targetCol, targetRow)) return { x: targetX, y: targetY };
    if (fromCol === targetCol && fromRow === targetRow) return { x: targetX, y: targetY };
    const idx = colRowToIndex(targetCol, targetRow, grid.cols);
    const graph = createNavGraphView(grid);
    const sides = graph.beltEntryExit(targetCol, targetRow);
    if (!sides) return { x: targetX, y: targetY };
    return floorBeltEntryEdgeWorldPoint(grid, targetCol, targetRow, sides.entrySide);
}
