import { packEdgeCellKey } from "../../DataStructures/CellKey.js";
import { railWallThicknessPx } from "./CellEdgeStore.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { cellInRect, gridSideOutwardVector } from "./GridUtils.js";
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
export function cellEdgeEndpointsIdx(grid, idx, side, p1, p2, inset = 0) {
    const bounds = grid.getCellBoundsByIdx(idx);
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
        p1.x = minX;
        p1.y = maxY - inset;
        p2.x = maxX;
        p2.y = maxY - inset;
    } else {
        p1.x = minX + inset;
        p1.y = minY;
        p2.x = minX + inset;
        p2.y = maxY;
    }
    return p1;
}
function edgeRailEmitOwner(grid, idx, side) {
    if (side === 2 || side === 1) return true;
    if (side === 0) return idx < grid.cols;
    return idx % grid.cols === 0;
}
export function railWallEdgeAt(grid, idx, side) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return null;
    return grid.edgeStore.getIdx(idx, side);
}
export function railWallEdgeShouldEmit(grid, idx, side) {
    if (!railWallEdgeAt(grid, idx, side)) return false;
    return edgeRailEmitOwner(grid, idx, side);
}
export function edgeRailCollisionThicknessPx(grid, idx, side) {
    const railEdge = railWallEdgeAt(grid, idx, side);
    return railWallThicknessPx(railEdge);
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
const sExposedEdgeP1 = { x: 0, y: 0 };
const sExposedEdgeP2 = { x: 0, y: 0 };
function pushExposedWallEdgesForCell(grid, idx, out) {
    const cols = grid.cols;
    const rows = grid.rows;
    const level = grid.grid[idx];
    if (level === 0) return;
    const wallTopZ = resolveCellWallHeightAtIdx(grid, idx);
    for (let side = 0; side < 4; side++) {
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        let neighborLevel = 0;
        if (nIdx !== -1) neighborLevel = grid.grid[nIdx];
        if (neighborLevel >= level) continue;
        if (railWallEdgeAt(grid, idx, side)) continue;
        cellEdgeEndpointsIdx(grid, idx, side, sExposedEdgeP1, sExposedEdgeP2, 0);
        const outward = gridSideOutwardVector(side);
        out.add(sExposedEdgeP1.x, sExposedEdgeP1.y, sExposedEdgeP2.x, sExposedEdgeP2.y, outward.x, outward.y, wallTopZ);
    }
}
/** Perimeter edges where a filled wall cell meets lower or empty neighbor. */
export function collectExposedWallEdges(grid, out) {
    out.clear();
    const cellCount = grid.cols * grid.rows;
    for (let idx = 0; idx < cellCount; idx++) pushExposedWallEdgesForCell(grid, idx, out);
}
/** Same as collectExposedWallEdges but only visits wall cells overlapping the world AABB. */
export function collectExposedWallEdgesInAabb(grid, bounds, out) {
    out.clear();
    forEachObstacleGridCellInAabb(grid, bounds, (idx) => {
        pushExposedWallEdgesForCell(grid, idx, out);
    });
}
export function packEdgeCellKeyByIdx(grid, idx, side) {
    const bounds = grid.getCellBoundsByIdx(idx);
    const cellSize = grid.cellSize;
    const gc = Math.floor(bounds.minX / cellSize);
    const gr = Math.floor(bounds.minY / cellSize);
    return gc + gr * 65536 + (side + 1) * 4294967296; // 65536 is KEY_STRIDE, 4294967296 is EDGE_KEY_STRIDE
}
export function canonicalEdgeCellKeyIdx(grid, idx, side) {
    const keyA = packEdgeCellKeyByIdx(grid, idx, side);
    const nIdx = edgeNeighborIdx(idx, side, grid.cols, grid.rows);
    if (nIdx === -1) return keyA;
    const keyB = packEdgeCellKeyByIdx(grid, nIdx, edgeMirrorSide(side));
    return keyA <= keyB ? keyA : keyB;
}
export function isCanonicalEdgeRepresentativeIdx(grid, idx, side) {
    return packEdgeCellKeyByIdx(grid, idx, side) === canonicalEdgeCellKeyIdx(grid, idx, side);
}
export function forEachCellEdge(grid, fn, { canonicalOnly = false, minCol, maxCol, minRow, maxRow, filter } = {}) {
    if (!grid.cols) return;
    const startCol = minCol ?? 0;
    const endCol = maxCol ?? grid.cols - 1;
    const startRow = minRow ?? 0;
    const endRow = maxRow ?? grid.rows - 1;
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const cellIdx = r * grid.cols + c;
            for (let side = 0; side < 4; side++) {
                if (canonicalOnly && !isCanonicalEdgeRepresentativeIdx(grid, cellIdx, side)) continue;
                const edge = grid.edgeStore.getIdx(cellIdx, side);
                if (!edge) continue;
                if (filter && !filter(edge)) continue;
                if (fn(cellIdx, side, edge) === false) return;
            }
        }
}
