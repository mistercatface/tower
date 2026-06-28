import { createNavGraphView, snapNavGraphGoalCell } from "./navGraph.js";
import { isFloorBeltKind, floorBeltEntryEdgeWorldPoint, isFloorBeltCell } from "../Spatial/grid/FloorCell.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
export function snapNavGoalCellIndex(grid, fromIdx, targetIdx) {
    const cols = grid.cols;
    const fromCol = fromIdx % cols;
    const fromRow = (fromIdx / cols) | 0;
    const targetCol = targetIdx % cols;
    const targetRow = (targetIdx / cols) | 0;
    const graph = createNavGraphView(grid);
    if (!isFloorBeltKind(grid.floorStore.kind[targetIdx])) return targetIdx;
    const neighbor = graph.beltEntryNeighbor(targetCol, targetRow);
    if (!neighbor || neighbor.col < 0 || neighbor.col >= cols || neighbor.row < 0 || neighbor.row >= grid.rows) return targetIdx;
    if (grid.isBlocked(neighbor.col, neighbor.row)) return targetIdx;
    if (fromCol === neighbor.col && fromRow === neighbor.row) return targetIdx;
    return neighbor.col + neighbor.row * cols;
}
export function snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow) {
    return snapNavGraphGoalCell(createNavGraphView(grid), fromCol, fromRow, targetCol, targetRow);
}
/**
 * Snap a world-space steer/path goal — cell snap when upstream, entry-edge point when targeting a belt cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalWorld(grid, fromX, fromY, targetX, targetY) {
    const fromCol = grid.worldCol(fromX);
    const fromRow = grid.worldRow(fromY);
    const targetCol = grid.worldCol(targetX);
    const targetRow = grid.worldRow(targetY);
    if (!cellInRect(targetCol, targetRow, grid.cols, grid.rows)) return { x: targetX, y: targetY };
    const snapped = snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow);
    if (snapped.col !== targetCol || snapped.row !== targetRow) return { x: grid.gridCenterX(snapped.col), y: grid.gridCenterY(snapped.row) };
    if (!isFloorBeltCell(grid, targetCol, targetRow)) return { x: targetX, y: targetY };
    if (fromCol === targetCol && fromRow === targetRow) return { x: targetX, y: targetY };
    const idx = colRowToIndex(targetCol, targetRow, grid.cols);
    const graph = createNavGraphView(grid);
    const sides = graph.beltEntryExit(targetCol, targetRow);
    if (!sides) return { x: targetX, y: targetY };
    return floorBeltEntryEdgeWorldPoint(grid, targetCol, targetRow, sides.entrySide);
}
