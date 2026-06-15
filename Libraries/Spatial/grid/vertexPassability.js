import { cellInRect } from "./GridUtils.js";
import { boundaryBlocksStepFrom, boundaryDirectedCrossingBlocked } from "./boundaryOccupancy.js";
/** Bit i set when half-edge i is open (not boundary-blocked). See {@link HALF_EDGE_SPECS}. */
export const VERTEX_HALF_EDGE = { NwEast: 1 << 0, NwSouth: 1 << 1, NeWest: 1 << 2, NeSouth: 1 << 3, SwEast: 1 << 4, SwNorth: 1 << 5, SeWest: 1 << 6, SeNorth: 1 << 7 };
/** @type {readonly { bit: number, fromCol: number, fromRow: number, toCol: number, toRow: number, ownerCol: number, ownerRow: number, ownerSide: number }[]} */
const HALF_EDGE_SPECS = [
    { bit: VERTEX_HALF_EDGE.NwEast, fromCol: -1, fromRow: -1, toCol: 0, toRow: -1, ownerCol: -1, ownerRow: -1, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.NwSouth, fromCol: -1, fromRow: -1, toCol: -1, toRow: 0, ownerCol: -1, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.NeWest, fromCol: 0, fromRow: -1, toCol: -1, toRow: -1, ownerCol: 0, ownerRow: -1, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.NeSouth, fromCol: 0, fromRow: -1, toCol: 0, toRow: 0, ownerCol: 0, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.SwEast, fromCol: -1, fromRow: 0, toCol: 0, toRow: 0, ownerCol: -1, ownerRow: 0, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.SwNorth, fromCol: -1, fromRow: 0, toCol: -1, toRow: -1, ownerCol: -1, ownerRow: 0, ownerSide: 0 },
    { bit: VERTEX_HALF_EDGE.SeWest, fromCol: 0, fromRow: 0, toCol: -1, toRow: 0, ownerCol: 0, ownerRow: 0, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.SeNorth, fromCol: 0, fromRow: 0, toCol: 0, toRow: -1, ownerCol: 0, ownerRow: 0, ownerSide: 0 },
];
/** @param {number} vx @param {number} vy @param {number} cols */
export function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} vx @param {number} vy */
export function getVertexPassabilityMask(grid, vx, vy) {
    return grid.vertexPassability[packVertexKey(vx, vy, grid.cols)] ?? 0;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function recomputeVertexPassability(grid) {
    if (!grid.cols) {
        grid.vertexPassability = new Uint8Array(0);
        return;
    }
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    const out = new Uint8Array(vertCount);
    for (let vy = 0; vy <= grid.rows; vy++)
        for (let vx = 0; vx <= grid.cols; vx++) {
            let mask = 0;
            for (let i = 0; i < HALF_EDGE_SPECS.length; i++) {
                const spec = HALF_EDGE_SPECS[i];
                const fromCol = vx + spec.fromCol;
                const fromRow = vy + spec.fromRow;
                const toCol = vx + spec.toCol;
                const toRow = vy + spec.toRow;
                const ownerCol = vx + spec.ownerCol;
                const ownerRow = vy + spec.ownerRow;
                if (!cellInRect(fromCol, fromRow, grid.cols, grid.rows) || !cellInRect(toCol, toRow, grid.cols, grid.rows)) continue;
                if (!boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, ownerCol, ownerRow, spec.ownerSide)) mask |= spec.bit;
            }
            out[packVertexKey(vx, vy, grid.cols)] = mask;
        }
    grid.vertexPassability = out;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {string} passagePowerSyncKey
 */
export function syncVertexPassability(grid, passagePowerSyncKey) {
    const key = `${grid.wallGridRevision}:${passagePowerSyncKey}`;
    if (grid._vertexPassabilitySyncKey === key) return;
    recomputeVertexPassability(grid);
    grid._vertexPassabilitySyncKey = key;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} fromCol @param {number} fromRow @param {number} toCol @param {number} toRow */
export function diagonalBoundaryBlockedFromVertexCache(grid, fromCol, fromRow, toCol, toRow) {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc === 0 || dr === 0) return boundaryBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow);
    if (grid.isBlocked(fromCol + dc, fromRow) || grid.isBlocked(fromCol, fromRow + dr)) return true;
    const cvx = dc > 0 ? toCol : fromCol;
    const cvy = dr > 0 ? toRow : fromRow;
    const mask = getVertexPassabilityMask(grid, cvx, cvy);
    const key = `${dc},${dr}`;
    /** @type {Record<string, number[]>} */
    const bitsByStep = {
        "1,1": [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth],
        "-1,-1": [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest],
        "1,-1": [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast],
        "-1,1": [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth],
    };
    const need = bitsByStep[key];
    if (!need) return boundaryBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow);
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return true;
    return false;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} fromCol @param {number} fromRow @param {number} toCol @param {number} toRow */
function legacyDiagonalBoundaryOnly(grid, fromCol, fromRow, toCol, toRow) {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc === 0 || dr === 0) return boundaryBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow);
    if (grid.isBlocked(fromCol + dc, fromRow) || grid.isBlocked(fromCol, fromRow + dr)) return true;
    const sideX = dc > 0 ? 1 : 3;
    const sideY = dr > 0 ? 2 : 0;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, sideX)) return true;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, sideY)) return true;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow + dr, sideX)) return true;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol + dc, fromRow, sideY)) return true;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol + dc, fromRow, sideX)) return true;
    if (boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow + dr, sideY)) return true;
    return false;
}
/**
 * Dev guard — half-edge bits and diagonal cache must match live boundary crossing rules.
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {number} mismatch count
 */
export function assertVertexPassability(grid) {
    let mismatches = 0;
    for (let vy = 0; vy <= grid.rows; vy++)
        for (let vx = 0; vx <= grid.cols; vx++) {
            let mask = 0;
            for (let i = 0; i < HALF_EDGE_SPECS.length; i++) {
                const spec = HALF_EDGE_SPECS[i];
                const fromCol = vx + spec.fromCol;
                const fromRow = vy + spec.fromRow;
                const toCol = vx + spec.toCol;
                const toRow = vy + spec.toRow;
                const ownerCol = vx + spec.ownerCol;
                const ownerRow = vy + spec.ownerRow;
                if (!cellInRect(fromCol, fromRow, grid.cols, grid.rows) || !cellInRect(toCol, toRow, grid.cols, grid.rows)) continue;
                const open = !boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, ownerCol, ownerRow, spec.ownerSide);
                if (open) mask |= spec.bit;
            }
            const cached = getVertexPassabilityMask(grid, vx, vy);
            if (cached !== mask) mismatches++;
        }
    const half = grid.cellSize * 0.5;
    /** @param {number} globalCol @param {number} globalRow */
    const toLocal = (globalCol, globalRow) => grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    const samples = [
        [7, -1, 8, 0],
        [8, 0, 9, 1],
        [7, 2, 8, 3],
        [0, 0, 1, 1],
        [1, 1, 0, 0],
        [8, 1, 9, 0],
        [8, 2, 7, 3],
    ];
    for (let i = 0; i < samples.length; i++) {
        const a = toLocal(samples[i][0], samples[i][1]);
        const b = toLocal(samples[i][2], samples[i][3]);
        const fc = a.col;
        const fr = a.row;
        const tc = b.col;
        const tr = b.row;
        if (!cellInRect(fc, fr, grid.cols, grid.rows) || !cellInRect(tc, tr, grid.cols, grid.rows)) continue;
        const legacy = legacyDiagonalBoundaryOnly(grid, fc, fr, tc, tr);
        const cached = diagonalBoundaryBlockedFromVertexCache(grid, fc, fr, tc, tr);
        if (legacy !== cached) mismatches++;
    }
    if (mismatches) console.error(`vertexPassability: ${mismatches} mismatch(es) vs boundary crossing rules`);
    return mismatches;
}
