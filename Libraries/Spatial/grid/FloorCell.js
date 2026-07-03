import { CARDINAL_FACING_STEPS, quantizeCardinalAngle } from "../../Math/Angle.js";
import { cellInRect } from "./GridUtils.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3, BeltRails: 4, BeltElbowLeftRails: 5, BeltElbowRightRails: 6 };
/** @param {number} kind */
export function isFloorBeltKind(kind) {
    return kind >= FLOOR_CELL_KIND.Belt && kind <= FLOOR_CELL_KIND.BeltElbowRightRails;
}
/** @param {number} kind */
export function isFloorBeltRailsKind(kind) {
    return kind === FLOOR_CELL_KIND.BeltRails || kind === FLOOR_CELL_KIND.BeltElbowLeftRails || kind === FLOOR_CELL_KIND.BeltElbowRightRails;
}
/** Swap a railed belt kind to its open (no lateral rails) equivalent; other kinds pass through. */
export function unrailedBeltKindFromRailed(kind) {
    if (kind === FLOOR_CELL_KIND.BeltRails) return FLOOR_CELL_KIND.Belt;
    if (kind === FLOOR_CELL_KIND.BeltElbowLeftRails) return FLOOR_CELL_KIND.BeltElbowLeft;
    if (kind === FLOOR_CELL_KIND.BeltElbowRightRails) return FLOOR_CELL_KIND.BeltElbowRight;
    return kind;
}
/** @param {number} kind @returns {"left" | "right" | null} */
export function floorBeltElbowTurn(kind) {
    if (kind === FLOOR_CELL_KIND.BeltElbowLeft || kind === FLOOR_CELL_KIND.BeltElbowLeftRails) return "left";
    if (kind === FLOOR_CELL_KIND.BeltElbowRight || kind === FLOOR_CELL_KIND.BeltElbowRightRails) return "right";
    return null;
}
const SIDES_CACHE = new Array(8 * 4);
for (let kind = 0; kind < 8; kind++)
    for (let facingIndex = 0; facingIndex < 4; facingIndex++) {
        const f = facingIndex;
        const turn = floorBeltElbowTurn(kind);
        let entrySide, exitSide;
        if (!turn) {
            exitSide = (f + 1) % 4;
            entrySide = (f + 3) % 4;
        } else if (turn === "left") {
            entrySide = (2 + f) % 4;
            exitSide = (1 + f) % 4;
        } else {
            entrySide = (0 + f) % 4;
            exitSide = (1 + f) % 4;
        }
        SIDES_CACHE[kind * 4 + facingIndex] = { entrySide, exitSide };
    }
/**
 * Entry/exit cell edges (0=N,1=E,2=S,3=W) from belt geometry + cardinal facing.
 * Straight: flow along facing. Elbows: W→N (left) / W→S (right) at facing 0, rotated by facing index.
 */
export function floorBeltEntryExitSides(kind, facingIndex) {
    const f = facingIndex % 4;
    const k = kind >= 0 && kind < 8 ? kind : 0;
    return SIDES_CACHE[k * 4 + f];
}
/** Lateral rail edges — the two sides that are neither entry nor exit. */
export function floorBeltRailEdgeSides(kind, facingIndex) {
    const { entrySide, exitSide } = floorBeltEntryExitSides(kind, facingIndex);
    /** @type {number[]} */
    const sides = [];
    for (let side = 0; side < 4; side++) if (side !== entrySide && side !== exitSide) sides.push(side);
    return sides;
}
const FLOOR_BELT_KIND_LABELS = {
    [FLOOR_CELL_KIND.Belt]: "Conveyor",
    [FLOOR_CELL_KIND.BeltElbowLeft]: "Conveyor Elbow L",
    [FLOOR_CELL_KIND.BeltElbowRight]: "Conveyor Elbow R",
    [FLOOR_CELL_KIND.BeltRails]: "Conveyor (rails)",
    [FLOOR_CELL_KIND.BeltElbowLeftRails]: "Conveyor Elbow L (rails)",
    [FLOOR_CELL_KIND.BeltElbowRightRails]: "Conveyor Elbow R (rails)",
};
const FLOOR_BELT_FACING_LABELS = ["E", "S", "W", "N"];
/** @param {number} kind */
export function formatFloorBeltKindLabel(kind) {
    return FLOOR_BELT_KIND_LABELS[kind] ?? "Belt";
}
/** @param {number} facingIndex 0…3 */
export function formatFloorBeltFacingLabel(facingIndex) {
    return FLOOR_BELT_FACING_LABELS[facingIndex % CARDINAL_FACING_STEPS];
}
/** Neighbor cell side index 0=N,1=E,2=S,3=W from `(c,r)` toward `(nc,nr)`. */
export function gridSideFromCellToNeighbor(c, r, nc, nr) {
    const dc = nc - c;
    const dr = nr - r;
    if (dc === 1 && dr === 0) return 1;
    if (dc === -1 && dr === 0) return 3;
    if (dc === 0 && dr === 1) return 2;
    if (dc === 0 && dr === -1) return 0;
    throw new Error(`gridSideFromCellToNeighbor: non-cardinal step ${dc},${dr}`);
}
/** Neighbor cell side index 0=N,1=E,2=S,3=W from `idx` toward `nIdx`. */
export function gridSideFromCellIdxToNeighborIdx(idx, nIdx, cols) {
    const diff = nIdx - idx;
    if (diff === 1) return 1;
    if (diff === -1) return 3;
    if (diff === cols) return 2;
    if (diff === -cols) return 0;
    throw new Error(`gridSideFromCellIdxToNeighborIdx: non-cardinal step index diff ${diff} with cols ${cols}`);
}
/** @param {number} entrySide @param {number} exitSide */
export function resolveRailedBeltFromSides(entrySide, exitSide) {
    /** @type {number[]} */
    const kinds = [FLOOR_CELL_KIND.BeltRails, FLOOR_CELL_KIND.BeltElbowLeftRails, FLOOR_CELL_KIND.BeltElbowRightRails];
    for (let ki = 0; ki < kinds.length; ki++) {
        const kind = kinds[ki];
        for (let facingIndex = 0; facingIndex < CARDINAL_FACING_STEPS; facingIndex++) {
            const sides = floorBeltEntryExitSides(kind, facingIndex);
            if (sides.entrySide === entrySide && sides.exitSide === exitSide) return { kind, facingIndex };
        }
    }
    return { kind: FLOOR_CELL_KIND.BeltRails, facingIndex: 0 };
}
/** @param {number} cardinalIndex 0…3 */
export function floorBeltFacingFromIndex(cardinalIndex) {
    return (cardinalIndex % CARDINAL_FACING_STEPS) * ((Math.PI * 2) / CARDINAL_FACING_STEPS);
}
/** @param {number} facingRadians */
export function floorBeltFacingToIndex(facingRadians) {
    const q = quantizeCardinalAngle(facingRadians);
    return Math.round(q / ((Math.PI * 2) / CARDINAL_FACING_STEPS)) % CARDINAL_FACING_STEPS;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx @param {number} entrySide */
export function floorBeltEntryEdgeWorldPoint(grid, idx, entrySide) {
    const x = grid.gridCenterXByIdx(idx);
    const y = grid.gridCenterYByIdx(idx);
    const inset = grid.cellSize * 0.35;
    if (entrySide === 0) return { x, y: y - inset };
    if (entrySide === 1) return { x: x + inset, y };
    if (entrySide === 2) return { x, y: y + inset };
    return { x: x - inset, y };
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} entrySide */
export function floorBeltEntryNeighborCell(col, row, entrySide) {
    if (entrySide === 0) return { col, row: row - 1 };
    if (entrySide === 1) return { col: col + 1, row };
    if (entrySide === 2) return { col, row: row + 1 };
    return { col: col - 1, row };
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function isFloorBeltCell(grid, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    return grid.floorStore.isBeltKindAtIdx(col + row * grid.cols);
}
/** Body center cell is a belt cell — same rule as tickFloorOccupancy. */
export function isEntityOnFloorBelt(grid, x, y) {
    const col = grid.worldCol(x);
    const row = grid.worldRow(y);
    return isFloorBeltCell(grid, col, row);
}
