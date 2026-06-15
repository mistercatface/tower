import { packEdgeCellKey } from "../../DataStructures/CellKey.js";
import { portalEdgeEmitsCollision } from "./portalAccess.js";
import { isBeltRailEdge, isForcefieldEdge, isPortalEdge, isRailWallEdge, createRailWallEdge, railWallThicknessPx, passageEdgeEmitsCollision } from "./CellEdge.js";
import { cellInRect, colRowToIndex } from "./GridUtils.js";
export function gridWallEdgeNeighbor(col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
export function gridWallEdgeMirrorSide(side) {
    return (side + 2) % 4;
}
export function gridWallEdgeEndpoints(grid, col, row, edge, p1, p2, inset = 0) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (edge === 0) {
        p1.x = minX;
        p1.y = minY + inset;
        p2.x = maxX;
        p2.y = minY + inset;
    } else if (edge === 1) {
        p1.x = maxX - inset;
        p1.y = minY;
        p2.x = maxX - inset;
        p2.y = maxY;
    } else if (edge === 2) {
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
function gridEdgeRailEmitOwner(grid, col, row, side) {
    if (side === 2 || side === 1) return true;
    if (side === 0) return row === 0;
    return col === 0;
}
export function gridCellEdge(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    return grid.edgeStore.get(col, row, side, grid.cols);
}
export function gridBeltRailEdge(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isBeltRailEdge(edge)) return null;
    return edge;
}
export function gridRailWallEdge(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    return edge;
}
export function gridForcefieldEdge(grid, col, row, side) {
    const edge = gridCellEdge(grid, col, row, side);
    if (!isForcefieldEdge(edge) || isPortalEdge(edge)) return null;
    return edge;
}
export function gridPortalEdge(grid, col, row, side) {
    const edge = gridCellEdge(grid, col, row, side);
    if (!isPortalEdge(edge)) return null;
    return edge;
}
export function gridWallEdgeRailShouldEmit(grid, col, row, edge) {
    if (!gridRailWallEdge(grid, col, row, edge)) return false;
    return gridEdgeRailEmitOwner(grid, col, row, edge);
}
export function gridBeltRailEdgeShouldEmit(grid, col, row, side) {
    if (!gridBeltRailEdge(grid, col, row, side)) return false;
    return gridEdgeRailEmitOwner(grid, col, row, side);
}
export function gridBlockingPassageEdge(grid, col, row, side) {
    if (!gridEdgeRailEmitOwner(grid, col, row, side)) return null;
    const forcefield = gridForcefieldEdge(grid, col, row, side);
    if (forcefield && passageEdgeEmitsCollision(forcefield)) return forcefield;
    const portal = gridPortalEdge(grid, col, row, side);
    if (portal && portalEdgeEmitsCollision(portal)) return portal;
    return null;
}
export function gridEdgeRailCollisionShouldEmit(grid, col, row, side) {
    return gridBeltRailEdgeShouldEmit(grid, col, row, side) || gridWallEdgeRailShouldEmit(grid, col, row, side) || gridBlockingPassageEdge(grid, col, row, side) != null;
}
export function gridEdgeRailCollisionThicknessPx(grid, col, row, side, defaultPassageThicknessLevel = 2) {
    const railEdge = gridRailWallEdge(grid, col, row, side);
    if (railEdge) return railWallThicknessPx(railEdge);
    if (gridBlockingPassageEdge(grid, col, row, side)) return railWallThicknessPx(createRailWallEdge(0, defaultPassageThicknessLevel));
    return 1;
}
export function gridNeighborFillLevel(grid, col, row, side) {
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    if (!cellInRect(nc, nr, grid.cols, grid.rows)) return 0;
    return grid.grid[nc + nr * grid.cols];
}
export function gridValueAtIdx(grid, idx) {
    return grid.grid[idx];
}
export function cellIsStaticWallAtIdx(grid, idx) {
    if (grid.grid[idx] === 0) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[idx]?.length;
}
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    if (grid.segmentGrid?.[idx]?.length) return 0;
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
export function gridCellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}
export function canonicalEdgeCellKey(grid, col, row, side) {
    const a = gridCellToGlobalColRow(grid, col, row);
    const keyA = packEdgeCellKey(a.globalCol, a.globalRow, side);
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    if (!cellInRect(nc, nr, grid.cols, grid.rows)) return keyA;
    const b = gridCellToGlobalColRow(grid, nc, nr);
    const keyB = packEdgeCellKey(b.globalCol, b.globalRow, gridWallEdgeMirrorSide(side));
    return keyA <= keyB ? keyA : keyB;
}
export function isCanonicalEdgeRepresentative(grid, col, row, side) {
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    return packEdgeCellKey(globalCol, globalRow, side) === canonicalEdgeCellKey(grid, col, row, side);
}
export function forEachGridEdge(grid, fn, { canonicalOnly = false, minCol, maxCol, minRow, maxRow, filter } = {}) {
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
export function collectStaticFillRoofHeightsFromGrid(grid) {
    const seen = new Set();
    const out = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const px = resolveCellWallHeightAtIdx(grid, idx);
        if (px > 0 && !seen.has(px)) {
            seen.add(px);
            out.push(px);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}
