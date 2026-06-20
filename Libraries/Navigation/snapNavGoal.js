import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltEntryEdgeWorldPoint, floorBeltEntryExitSides, floorBeltEntryNeighborCell, isFloorBeltCell } from "../Spatial/grid/FloorCell.js";
/**
 * Snap a grid path goal for directed topology (belt entry mouth).
 * Non-belt targets pass through; belt targets upstream unless the agent is already at the entry cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalCell(grid, fromCol, fromRow, targetCol, targetRow) {
    const idx = colRowToIndex(targetCol, targetRow, grid.cols);
    if (!grid.floorStore.isBeltKindAtIdx(idx)) return { col: targetCol, row: targetRow };
    const kind = grid.floorStore.kind[idx];
    const facingIndex = grid.floorStore.facing[idx];
    const { entrySide } = floorBeltEntryExitSides(kind, facingIndex);
    const neighbor = floorBeltEntryNeighborCell(targetCol, targetRow, entrySide);
    if (!cellInRect(neighbor.col, neighbor.row, grid.cols, grid.rows)) return { col: targetCol, row: targetRow };
    if (grid.isBlocked(neighbor.col, neighbor.row)) return { col: targetCol, row: targetRow };
    if (fromCol === neighbor.col && fromRow === neighbor.row) return { col: targetCol, row: targetRow };
    return neighbor;
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
    const { entrySide } = floorBeltEntryExitSides(grid.floorStore.kind[idx], grid.floorStore.facing[idx]);
    return floorBeltEntryEdgeWorldPoint(grid, targetCol, targetRow, entrySide);
}
