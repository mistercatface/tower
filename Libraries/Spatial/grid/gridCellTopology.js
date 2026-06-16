import { packEdgeCellKey } from "../../DataStructures/CellKey.js";
import { isBeltRailEdge, isForcefieldEdge, isRailWallEdge, createRailWallEdge, railWallThicknessPx, passageEdgeEmitsCollision } from "./CellEdge.js";
import { cellInRect, colRowToIndex } from "./GridUtils.js";
export function edgeNeighbor(col, row, side) {
    let nc = col;
    let nr = row;
    if (side === 0) nr = row - 1;
    else if (side === 1) nc = col + 1;
    else if (side === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
export function edgeMirrorSide(side) {
    return (side + 2) % 4;
}
export function cellEdgeEndpoints(grid, col, row, side, p1, p2, inset = 0) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (side === 0) {
        p1.x = minX;
        p1.y = minY + inset;
        p2.x = maxX;
        p2.y = minY + inset;
    } else if (side === 1) {
        p1.x = maxX - inset;
        p1.y = minY;
        p2.x = maxX - inset;
        p2.y = maxY;
    } else if (side === 2) {
        p1.x = maxX;
        p1.y = maxY - inset;
        p2.x = minX;
        p2.y = maxY - inset;
    } else {
        p1.x = minX + inset;
        p1.y = maxY;
        p2.x = minX + inset;
        p2.y = minY;
    }
}
function edgeRailEmitOwner(grid, col, row, side) {
    if (side === 2 || side === 1) return true;
    if (side === 0) return row === 0;
    return col === 0;
}
export function edgeAt(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    return grid.edgeStore.get(col, row, side, grid.cols);
}
export function beltRailEdgeAt(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isBeltRailEdge(edge)) return null;
    return edge;
}
export function railWallEdgeAt(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    return edge;
}
export function forcefieldEdgeAt(grid, col, row, side) {
    const edge = edgeAt(grid, col, row, side);
    if (!isForcefieldEdge(edge)) return null;
    return edge;
}
export function railWallEdgeShouldEmit(grid, col, row, side) {
    if (!railWallEdgeAt(grid, col, row, side)) return false;
    return edgeRailEmitOwner(grid, col, row, side);
}
export function beltRailEdgeShouldEmit(grid, col, row, side) {
    if (!beltRailEdgeAt(grid, col, row, side)) return false;
    return edgeRailEmitOwner(grid, col, row, side);
}
export function blockingPassageEdgeAt(grid, col, row, side) {
    if (!edgeRailEmitOwner(grid, col, row, side)) return null;
    const forcefield = forcefieldEdgeAt(grid, col, row, side);
    if (forcefield && passageEdgeEmitsCollision(forcefield)) return forcefield;
    return null;
}
export function edgeRailCollisionShouldEmit(grid, col, row, side) {
    return beltRailEdgeShouldEmit(grid, col, row, side) || railWallEdgeShouldEmit(grid, col, row, side) || blockingPassageEdgeAt(grid, col, row, side) != null;
}
export function edgeRailCollisionThicknessPx(grid, col, row, side, defaultPassageThicknessLevel = 2) {
    const railEdge = railWallEdgeAt(grid, col, row, side);
    if (railEdge) return railWallThicknessPx(railEdge);
    if (blockingPassageEdgeAt(grid, col, row, side)) return railWallThicknessPx(createRailWallEdge(0, defaultPassageThicknessLevel));
    return 1;
}
export function neighborFillLevel(grid, col, row, side) {
    const { nc, nr } = edgeNeighbor(col, row, side);
    if (!cellInRect(nc, nr, grid.cols, grid.rows)) return 0;
    return grid.grid[nc + nr * grid.cols];
}
export function cellIsStaticWallAtIdx(grid, idx) {
    return grid.grid[idx] !== 0;
}
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    return level * grid.cellSize;
}
export function cellIsStaticWall(grid, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    return cellIsStaticWallAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
export function resolveCellWallHeightPx(grid, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return 0;
    return resolveCellWallHeightAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
export function cellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}
export function canonicalEdgeCellKey(grid, col, row, side) {
    const a = cellToGlobalColRow(grid, col, row);
    const keyA = packEdgeCellKey(a.globalCol, a.globalRow, side);
    const { nc, nr } = edgeNeighbor(col, row, side);
    if (!cellInRect(nc, nr, grid.cols, grid.rows)) return keyA;
    const b = cellToGlobalColRow(grid, nc, nr);
    const keyB = packEdgeCellKey(b.globalCol, b.globalRow, edgeMirrorSide(side));
    return keyA <= keyB ? keyA : keyB;
}
export function isCanonicalEdgeRepresentative(grid, col, row, side) {
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    return packEdgeCellKey(globalCol, globalRow, side) === canonicalEdgeCellKey(grid, col, row, side);
}
export function forEachCellEdge(grid, fn, { canonicalOnly = false, minCol, maxCol, minRow, maxRow, filter } = {}) {
    if (!grid.cols) return;
    const startCol = minCol ?? 0;
    const endCol = maxCol ?? grid.cols - 1;
    const startRow = minRow ?? 0;
    const endRow = maxRow ?? grid.rows - 1;
    for (let row = startRow; row <= endRow; row++)
        for (let col = startCol; col <= endCol; col++) {
            const cellIdx = colRowToIndex(col, row, grid.cols);
            for (let side = 0; side < 4; side++) {
                if (canonicalOnly && !isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
                const edge = grid.edgeStore.get(col, row, side, grid.cols);
                if (!edge) continue;
                if (filter && !filter(edge)) continue;
                if (fn(col, row, side, edge, cellIdx) === false) return;
            }
        }
}
