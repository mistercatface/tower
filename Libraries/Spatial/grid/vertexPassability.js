import { cellInRect, colRowToIndex } from "./GridUtils.js";
import { boundaryDirectedCrossingBlocked, boundaryBlocksStepFrom } from "./boundaryOccupancy.js";
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
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | import("../../Pathfinding/navSimView.js").ReturnType<typeof import("../../Pathfinding/navSimView.js").createNavSimView>} grid @param {Uint8Array} vertexPassability @param {import("../../DataStructures/CellRect.js").CellBounds | null} [bounds] cell bounds — vertex rect is expanded by one corner */
export function recomputeVertexPassabilityInto(grid, vertexPassability, bounds = null) {
    if (!grid.cols) return;
    const { cols, rows } = grid;
    const vx0 = bounds ? Math.max(0, bounds.startCol) : 0;
    const vx1 = bounds ? Math.min(cols, bounds.endCol + 1) : cols;
    const vy0 = bounds ? Math.max(0, bounds.startRow) : 0;
    const vy1 = bounds ? Math.min(rows, bounds.endRow + 1) : rows;
    for (let vy = vy0; vy <= vy1; vy++)
        for (let vx = vx0; vx <= vx1; vx++) {
            let mask = 0;
            for (let i = 0; i < HALF_EDGE_SPECS.length; i++) {
                const spec = HALF_EDGE_SPECS[i];
                const fromCol = vx + spec.fromCol;
                const fromRow = vy + spec.fromRow;
                const toCol = vx + spec.toCol;
                const toRow = vy + spec.toRow;
                const ownerCol = vx + spec.ownerCol;
                const ownerRow = vy + spec.ownerRow;
                if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) continue;
                if (!boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, ownerCol, ownerRow, spec.ownerSide)) mask |= spec.bit;
            }
            vertexPassability[packVertexKey(vx, vy, cols)] = mask;
        }
}
export function recomputeVertexPassability(grid) {
    if (!grid.cols) {
        grid.vertexPassability = new Uint8Array(0);
        return;
    }
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    const out = new Uint8Array(vertCount);
    recomputeVertexPassabilityInto(grid, out);
    grid.vertexPassability = out;
}
const CARDINAL_BITS = { "1,0": 1, "0,1": 2, "-1,0": 4, "0,-1": 8 };
const DIAGONAL_VERTEX_BITS = {
    "1,1": [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth],
    "-1,-1": [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest],
    "1,-1": [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast],
    "-1,1": [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth],
};
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | import("../../Pathfinding/navSimView.js").ReturnType<typeof import("../../Pathfinding/navSimView.js").createNavSimView>} grid @param {Uint8Array} cardinalOpen @param {import("../../DataStructures/CellRect.js").CellBounds | null} [bounds] */
export function recomputeNavCardinalOpenInto(grid, cardinalOpen, bounds = null) {
    const { cols, rows } = grid;
    const c0 = bounds ? bounds.startCol : 0;
    const c1 = bounds ? bounds.endCol : cols - 1;
    const r0 = bounds ? bounds.startRow : 0;
    const r1 = bounds ? bounds.endRow : rows - 1;
    for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (grid.isBlocked(col, row)) {
                cardinalOpen[idx] = 0;
                continue;
            }
            let mask = 0;
            for (const key in CARDINAL_BITS) {
                const [dc, dr] = key.split(",").map(Number);
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, cols, rows)) continue;
                if (!grid.isBlocked(nc, nr) && !boundaryBlocksStepFrom(grid, col, row, nc, nr)) mask |= CARDINAL_BITS[key];
            }
            cardinalOpen[idx] = mask;
        }
}
/** Cardinal step bits per open cell — baked on topology sync, not on click. */
export function recomputeNavCardinalOpen(grid) {
    const { cols, rows } = grid;
    const size = cols * rows;
    const out = new Uint8Array(size);
    recomputeNavCardinalOpenInto(grid, out);
    grid.navCardinalOpen = out;
}
export function diagonalStepOpen(blocked, vertexPassability, cols, rows, col, row, dc, dr) {
    if (blocked[colRowToIndex(col + dc, row, cols)] || blocked[colRowToIndex(col, row + dr, cols)]) return false;
    const cvx = dc > 0 ? col + dc : col;
    const cvy = dr > 0 ? row + dr : row;
    const mask = vertexPassability[packVertexKey(cvx, cvy, cols)] ?? 0;
    const need = DIAGONAL_VERTEX_BITS[`${dc},${dr}`];
    if (!need) return false;
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return false;
    return true;
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
