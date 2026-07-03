import { beltEntryExitAtIdx, beltEntryNeighborAtIdx } from "./navGraph.js";
import { isFloorBeltKind, floorBeltEntryEdgeWorldPoint } from "../Spatial/grid/FloorCell.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
export function snapNavGoalCellIndex(grid, fromIdx, targetIdx) {
    if (!isFloorBeltKind(grid.floorStore.kind[targetIdx])) return targetIdx;
    const neighborIdx = beltEntryNeighborAtIdx(grid, targetIdx);
    if (neighborIdx === -1 || grid.grid[neighborIdx] !== 0) return targetIdx;
    if (fromIdx === neighborIdx) return targetIdx;
    return neighborIdx;
}
export function snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow) {
    const cols = grid.cols;
    const fromIdx = fromCol + fromRow * cols;
    const targetIdx = targetCol + targetRow * cols;
    const snappedIdx = snapNavGoalCellIndex(grid, fromIdx, targetIdx);
    return { col: snappedIdx % cols, row: (snappedIdx / cols) | 0 };
}
/**
 * Snap a world-space steer/path goal — cell snap when upstream, entry-edge point when targeting a belt cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalWorld(grid, fromX, fromY, targetX, targetY) {
    const cols = grid.cols;
    const rows = grid.rows;
    const fromCol = grid.worldCol(fromX);
    const fromRow = grid.worldRow(fromY);
    const targetCol = grid.worldCol(targetX);
    const targetRow = grid.worldRow(targetY);
    if (!cellInRect(targetCol, targetRow, cols, rows)) return { x: targetX, y: targetY };
    const fromIdx = fromCol + fromRow * cols;
    const targetIdx = targetCol + targetRow * cols;
    const snappedIdx = snapNavGoalCellIndex(grid, fromIdx, targetIdx);
    if (snappedIdx !== targetIdx) return { x: grid.gridCenterXByIdx(snappedIdx), y: grid.gridCenterYByIdx(snappedIdx) };
    if (!isFloorBeltKind(grid.floorStore.kind[targetIdx])) return { x: targetX, y: targetY };
    if (fromIdx === targetIdx) return { x: targetX, y: targetY };
    const sides = beltEntryExitAtIdx(grid, targetIdx);
    if (!sides) return { x: targetX, y: targetY };
    return floorBeltEntryEdgeWorldPoint(grid, targetIdx, sides.entrySide);
}
