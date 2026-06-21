import { gridSideFromCellToNeighbor } from "../../Spatial/grid/FloorCell.js";
import { cellInRect, gridCellLayout, gridSideNeighborCell, layoutCellIndex } from "../../Spatial/grid/GridUtils.js";
import { createNavGraphViewFromContext } from "../../Navigation/navGraph.js";
function oppositeSide(side) {
    return (side + 2) % 4;
}
function cellIndex(col, row, layout) {
    return layoutCellIndex(col, row, layout.originCol, layout.originRow, layout.strideCols);
}
function navStepOpen(grid, gridNavContext, fromCol, fromRow, toCol, toRow) {
    return createNavGraphViewFromContext(gridNavContext).canStep(fromCol, fromRow, toCol, toRow);
}
/** True when at least one cardinal side has an open, bidirectional step to a walkable neighbor. */
export function hasOpenBeltMouthSide(grid, gridNavContext, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows) || grid.isBlocked(col, row)) return false;
    for (let side = 0; side < 4; side++) {
        const neighbor = gridSideNeighborCell(col, row, side);
        if (!cellInRect(neighbor.col, neighbor.row, grid.cols, grid.rows)) continue;
        if (grid.isBlocked(neighbor.col, neighbor.row)) continue;
        if (!navStepOpen(grid, gridNavContext, neighbor.col, neighbor.row, col, row)) continue;
        if (!navStepOpen(grid, gridNavContext, col, row, neighbor.col, neighbor.row)) continue;
        return true;
    }
    return false;
}
/** @param {{ col: number, row: number }[]} cells */
export function filterNavBeltEndpointCandidates(grid, gridNavContext, cells) {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (hasOpenBeltMouthSide(grid, gridNavContext, cell.col, cell.row)) out.push(cell);
    }
    return out;
}
/** @param {{ c: number, r: number }[]} path */
export function beltPathMouthExteriorCells(path) {
    const start = path[0];
    const second = path[1];
    const end = path[path.length - 1];
    const prev = path[path.length - 2];
    const startFlowSide = gridSideFromCellToNeighbor(start.c, start.r, second.c, second.r);
    const startEntrySide = oppositeSide(startFlowSide);
    const entryNeighbor = gridSideNeighborCell(start.c, start.r, startEntrySide);
    const endEntrySide = gridSideFromCellToNeighbor(end.c, end.r, prev.c, prev.r);
    const endExitSide = oppositeSide(endEntrySide);
    const exitNeighbor = gridSideNeighborCell(end.c, end.r, endExitSide);
    return { entryExterior: { col: entryNeighbor.col, row: entryNeighbor.row }, exitExterior: { col: exitNeighbor.col, row: exitNeighbor.row } };
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} gridNavContext
 * @param {{ c: number, r: number }[]} path
 * @param {Set<number>} [occupied]
 */
export function validateBeltPathMouthAccess(grid, gridNavContext, path, occupied = new Set()) {
    if (path.length < 2) return false;
    const layout = gridCellLayout(grid);
    const start = path[0];
    const end = path[path.length - 1];
    const { entryExterior, exitExterior } = beltPathMouthExteriorCells(path);
    if (!cellInRect(entryExterior.col, entryExterior.row, grid.cols, grid.rows)) return false;
    if (!cellInRect(exitExterior.col, exitExterior.row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(entryExterior.col, entryExterior.row)) return false;
    if (grid.isBlocked(exitExterior.col, exitExterior.row)) return false;
    if (occupied.has(cellIndex(entryExterior.col, entryExterior.row, layout))) return false;
    if (occupied.has(cellIndex(exitExterior.col, exitExterior.row, layout))) return false;
    if (!navStepOpen(grid, gridNavContext, entryExterior.col, entryExterior.row, start.c, start.r)) return false;
    if (!navStepOpen(grid, gridNavContext, end.c, end.r, exitExterior.col, exitExterior.row)) return false;
    return true;
}
/** @param {{ c: number, r: number }[][]} paths @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function collectPathMouthExteriorIndices(paths, grid) {
    const layout = gridCellLayout(grid);
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 2) continue;
        mouths.add(cellIndex(path[0].c, path[0].r, layout));
        mouths.add(cellIndex(path[path.length - 1].c, path[path.length - 1].r, layout));
        const { entryExterior, exitExterior } = beltPathMouthExteriorCells(path);
        mouths.add(cellIndex(entryExterior.col, entryExterior.row, layout));
        mouths.add(cellIndex(exitExterior.col, exitExterior.row, layout));
    }
    return mouths;
}
