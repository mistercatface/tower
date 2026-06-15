import { worldToGridAtOrigin, gridToWorldAtOrigin } from "../Spatial/grid/GridCoords.js";
import { cellInRect, colRowToIndex, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
export function buildGridNavSnapshot(grid, cacheKey) {
    const { cols, rows, cellSize, cellHalfSize, minX, minY, wallGridRevision, boundaryNavEpoch } = grid;
    const size = cols * rows;
    const blocked = new Uint8Array(size);
    const octileNeighbors = new Int32Array(size * 8);
    octileNeighbors.fill(-1);
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (grid.isBlocked(col, row)) {
                blocked[idx] = 1;
                continue;
            }
            blocked[idx] = 0;
            const base = idx * 8;
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
                const { dc, dr } = OCTILE_OFFSETS[i];
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, cols, rows)) continue;
                if (grid.canStep(col, row, nc, nr)) octileNeighbors[base + i] = colRowToIndex(nc, nr, cols);
            }
        }
    return { cacheKey, revision: wallGridRevision, boundaryNavEpoch, cols, rows, cellSize, cellHalfSize, minX, minY, blocked, octileNeighbors, vertexPassability: grid.vertexPassability };
}
export function snapshotNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid._vertexPassabilitySyncKey}:${grid.boundaryNavEpoch}`;
}
export function snapshotIsBlocked(snapshot, col, row) {
    if (!cellInRect(col, row, snapshot.cols, snapshot.rows)) return true;
    return snapshot.blocked[colRowToIndex(col, row, snapshot.cols)] !== 0;
}
export function snapshotWorldToGrid(snapshot, x, y) {
    return worldToGridAtOrigin(x, y, snapshot.minX, snapshot.minY, snapshot.cellSize);
}
export function snapshotGridToWorld(snapshot, col, row) {
    return gridToWorldAtOrigin(col, row, snapshot.minX, snapshot.minY, snapshot.cellSize);
}
export function snapshotOctileNeighborIdx(snapshot, col, row, offsetIndex) {
    const idx = colRowToIndex(col, row, snapshot.cols);
    return snapshot.octileNeighbors[idx * 8 + offsetIndex];
}
export function snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow) {
    const { cols, rows } = snapshot;
    if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) return false;
    const fromIdx = colRowToIndex(fromCol, fromRow, cols);
    if (snapshot.blocked[fromIdx]) return false;
    const toIdx = colRowToIndex(toCol, toRow, cols);
    for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
        const { dc, dr } = OCTILE_OFFSETS[i];
        if (fromCol + dc === toCol && fromRow + dr === toRow) return snapshot.octileNeighbors[fromIdx * 8 + i] === toIdx;
    }
    return false;
}
export function createSnapshotNavGraphView(snapshot) {
    return {
        cols: snapshot.cols,
        rows: snapshot.rows,
        cellSize: snapshot.cellSize,
        cellHalfSize: snapshot.cellHalfSize,
        minX: snapshot.minX,
        minY: snapshot.minY,
        grid: snapshot.blocked,
        worldToGrid: (x, y) => snapshotWorldToGrid(snapshot, x, y),
        gridToWorld: (col, row) => snapshotGridToWorld(snapshot, col, row),
        isBlocked: (col, row) => snapshotIsBlocked(snapshot, col, row),
        canStep: (fromCol, fromRow, toCol, toRow) => snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow),
    };
}
