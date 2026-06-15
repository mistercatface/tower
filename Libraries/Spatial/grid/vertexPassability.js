import { cellInRect } from "./GridUtils.js";
import { boundaryDirectedCrossingBlocked } from "./boundaryOccupancy.js";
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
export function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
export function getVertexPassabilityMask(grid, vx, vy) {
    return grid.vertexPassability[packVertexKey(vx, vy, grid.cols)] ?? 0;
}
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
/** Recompute derived grid topology caches (worker-candidate; Spatial-owned). */
export function syncGridTopologyCaches(grid, passagePowerSyncKey) {
    const key = `${grid.wallGridRevision}:${passagePowerSyncKey}`;
    if (grid._vertexPassabilitySyncKey === key) return;
    recomputeVertexPassability(grid);
    grid._vertexPassabilitySyncKey = key;
}
/** Boundary-only diagonal block test — shoulders + vertex half-edge mask. Caller handles destination cell + belts. */
export function diagonalBoundaryBlockedFromVertexCache(grid, fromCol, fromRow, toCol, toRow) {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (grid.isBlocked(fromCol + dc, fromRow) || grid.isBlocked(fromCol, fromRow + dr)) return true;
    const cvx = dc > 0 ? toCol : fromCol;
    const cvy = dr > 0 ? toRow : fromRow;
    const mask = getVertexPassabilityMask(grid, cvx, cvy);
    /** @type {Record<string, number[]>} */
    const bitsByStep = {
        "1,1": [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth],
        "-1,-1": [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest],
        "1,-1": [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast],
        "-1,1": [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth],
    };
    const need = bitsByStep[`${dc},${dr}`];
    if (!need) return true;
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return true;
    return false;
}
