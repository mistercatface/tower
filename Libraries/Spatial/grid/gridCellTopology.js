import { packEdgeCellKey } from "../../DataStructures/CellKey.js";
import { isBeltRailEdge, isForcefieldEdge, isRailWallEdge, createRailWallEdge, railWallThicknessPx, passageEdgeEmitsCollision } from "./CellEdge.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { cellInRect, colRowToIndex, gridSideOutwardVector } from "./GridUtils.js";
export function edgeNeighborIdx(idx, side, cols, rows) {
    if (side === 0) return idx >= cols ? idx - cols : -1;
    if (side === 1) return (idx + 1) % cols !== 0 ? idx + 1 : -1;
    if (side === 2) return idx < cols * (rows - 1) ? idx + cols : -1;
    if (side === 3) return idx % cols !== 0 ? idx - 1 : -1;
    return -1;
}
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
function edgeRailEmitOwner(grid, idx, side) {
    if (side === 2 || side === 1) return true;
    if (side === 0) return idx < grid.cols;
    return idx % grid.cols === 0;
}
export function edgeAt(grid, idx, side) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return null;
    return grid.edgeStore.getIdx(idx, side);
}
export function beltRailEdgeAt(grid, idx, side) {
    const edge = edgeAt(grid, idx, side);
    if (!isBeltRailEdge(edge)) return null;
    return edge;
}
export function railWallEdgeAt(grid, idx, side) {
    const edge = edgeAt(grid, idx, side);
    if (!isRailWallEdge(edge)) return null;
    return edge;
}
export function forcefieldEdgeAt(grid, idx, side) {
    const edge = edgeAt(grid, idx, side);
    if (!isForcefieldEdge(edge)) return null;
    return edge;
}
export function railWallEdgeShouldEmit(grid, idx, side) {
    if (!railWallEdgeAt(grid, idx, side)) return false;
    return edgeRailEmitOwner(grid, idx, side);
}
export function beltRailEdgeShouldEmit(grid, idx, side) {
    if (!beltRailEdgeAt(grid, idx, side)) return false;
    return edgeRailEmitOwner(grid, idx, side);
}
export function blockingPassageEdgeAt(grid, idx, side) {
    if (!edgeRailEmitOwner(grid, idx, side)) return null;
    const forcefield = forcefieldEdgeAt(grid, idx, side);
    if (forcefield && passageEdgeEmitsCollision(forcefield)) return forcefield;
    return null;
}
export function edgeRailCollisionShouldEmit(grid, idx, side) {
    return beltRailEdgeShouldEmit(grid, idx, side) || railWallEdgeShouldEmit(grid, idx, side) || blockingPassageEdgeAt(grid, idx, side) != null;
}
export function edgeRailCollisionThicknessPx(grid, idx, side, defaultPassageThicknessLevel = 2) {
    const railEdge = railWallEdgeAt(grid, idx, side);
    if (railEdge) return railWallThicknessPx(railEdge);
    if (blockingPassageEdgeAt(grid, idx, side)) return railWallThicknessPx(createRailWallEdge(0, defaultPassageThicknessLevel));
    return 1;
}
export function neighborFillLevel(grid, idx, side) {
    const nIdx = edgeNeighborIdx(idx, side, grid.cols, grid.rows);
    if (nIdx === -1) return 0;
    return grid.grid[nIdx];
}
export function cellIsStaticWallAtIdx(grid, idx) {
    return grid.grid[idx] !== 0;
}
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    return level * grid.cellSize;
}
export function cellIsStaticWall(grid, idx) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return false;
    return grid.grid[idx] !== 0;
}
export function resolveCellWallHeightPx(grid, idx) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return 0;
    return resolveCellWallHeightAtIdx(grid, idx);
}
const sExposedEdgeP1 = { x: 0, y: 0 };
const sExposedEdgeP2 = { x: 0, y: 0 };
function pushExposedWallEdgesForCell(grid, col, row, out) {
    const cols = grid.cols;
    const rows = grid.rows;
    const idx = row * cols + col;
    const level = grid.grid[idx];
    if (level === 0) return;
    const wallTopZ = resolveCellWallHeightAtIdx(grid, idx);
    for (let side = 0; side < 4; side++) {
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        let neighborLevel = 0;
        if (nIdx !== -1) neighborLevel = grid.grid[nIdx];
        if (neighborLevel >= level) continue;
        if (railWallEdgeAt(grid, idx, side)) continue;
        cellEdgeEndpoints(grid, col, row, side, sExposedEdgeP1, sExposedEdgeP2, 0);
        const outward = gridSideOutwardVector(side);
        out.add(sExposedEdgeP1.x, sExposedEdgeP1.y, sExposedEdgeP2.x, sExposedEdgeP2.y, outward.x, outward.y, wallTopZ);
    }
}
/** Perimeter edges where a filled wall cell meets lower or empty neighbor. */
export function collectExposedWallEdges(grid, out) {
    out.clear();
    for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) pushExposedWallEdgesForCell(grid, col, row, out);
}
/** Same as collectExposedWallEdges but only visits wall cells overlapping the world AABB. */
export function collectExposedWallEdgesInAabb(grid, bounds, out) {
    out.clear();
    forEachObstacleGridCellInAabb(grid, bounds, (col, row) => {
        pushExposedWallEdgesForCell(grid, col, row, out);
    });
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
                const edge = grid.edgeStore.getIdx(cellIdx, side);
                if (!edge) continue;
                if (filter && !filter(edge)) continue;
                if (fn(col, row, side, edge, cellIdx) === false) return;
            }
        }
}
