import { CARDINAL_FACING_STEPS } from "../../Math/Angle.js";
import { cellInRect } from "./GridUtils.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3 };
/** @param {number} kind */
export function isFloorBeltKind(kind) {
    return kind >= FLOOR_CELL_KIND.Belt && kind <= FLOOR_CELL_KIND.BeltElbowRight;
}
/** @param {number} kind @returns {"left" | "right" | null} */
export function floorBeltElbowTurn(kind) {
    if (kind === FLOOR_CELL_KIND.BeltElbowLeft) return "left";
    if (kind === FLOOR_CELL_KIND.BeltElbowRight) return "right";
    return null;
}
const FLOOR_BELT_KIND_COUNT = 4;
const SIDES_CACHE = new Array(FLOOR_BELT_KIND_COUNT * 4);
for (let kind = 0; kind < FLOOR_BELT_KIND_COUNT; kind++)
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
    const k = kind >= 0 && kind < FLOOR_BELT_KIND_COUNT ? kind : 0;
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
const FLOOR_BELT_KIND_LABELS = { [FLOOR_CELL_KIND.Belt]: "Conveyor", [FLOOR_CELL_KIND.BeltElbowLeft]: "Conveyor Elbow L", [FLOOR_CELL_KIND.BeltElbowRight]: "Conveyor Elbow R" };
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
    return -1;
}
const BELT_KIND_RESOLVE_ORDER = [FLOOR_CELL_KIND.Belt, FLOOR_CELL_KIND.BeltElbowLeft, FLOOR_CELL_KIND.BeltElbowRight];
/** @param {number} entrySide @param {number} exitSide */
export function resolveBeltKindFromSides(entrySide, exitSide) {
    for (let ki = 0; ki < BELT_KIND_RESOLVE_ORDER.length; ki++) {
        const kind = BELT_KIND_RESOLVE_ORDER[ki];
        for (let facingIndex = 0; facingIndex < CARDINAL_FACING_STEPS; facingIndex++) {
            const sides = floorBeltEntryExitSides(kind, facingIndex);
            if (sides.entrySide === entrySide && sides.exitSide === exitSide) return { kind, facingIndex };
        }
    }
    return { kind: FLOOR_CELL_KIND.Belt, facingIndex: 0 };
}
/** @param {number} cardinalIndex 0…3 */
export function floorBeltFacingFromIndex(cardinalIndex) {
    return (cardinalIndex % CARDINAL_FACING_STEPS) * ((Math.PI * 2) / CARDINAL_FACING_STEPS);
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
/** Belt entry/exit sides at a grid idx, or null when the cell holds no belt. */
export function beltEntryExitAtIdx(grid, idx) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return null;
    const kind = grid.floorStore.kind[idx];
    if (!isFloorBeltKind(kind)) return null;
    return floorBeltEntryExitSides(kind, grid.floorStore.facing[idx]);
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function isFloorBeltCell(grid, idx) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return false;
    return grid.floorStore.hasAnyAtIdx(idx);
}
/** Body center cell is a belt cell — same rule as tickFloorOccupancy. */
export function isEntityOnFloorBelt(grid, x, y) {
    const col = grid.worldCol(x);
    const row = grid.worldRow(y);
    return isFloorBeltCell(grid, col + row * grid.cols);
}
/** Structure-of-arrays store for floor occupancy (belt kind + cardinal facing) per cell. */
export class FloorCellStore {
    constructor() {
        this.kind = new Uint8Array(0);
        this.facing = new Uint8Array(0);
    }
    reset(cellCount) {
        this.kind = new Uint8Array(cellCount);
        this.facing = new Uint8Array(cellCount);
    }
    remap(oldKind, oldFacing, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        const newKind = new Uint8Array(newCols * newRows);
        const newFacing = new Uint8Array(newCols * newRows);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            if (oldKind[idx] === FLOOR_CELL_KIND.None) continue;
            const row = (idx / oldCols) | 0;
            const col = idx - row * oldCols;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (!cellInRect(nc, nr, newCols, newRows)) continue;
            const newIdx = nc + nr * newCols;
            newKind[newIdx] = oldKind[idx];
            newFacing[newIdx] = oldFacing[idx];
        }
        this.kind = newKind;
        this.facing = newFacing;
    }
    hasAnyAtIdx(idx) {
        return this.kind[idx] !== FLOOR_CELL_KIND.None;
    }
    setAtIdx(idx, kind, facingIndex) {
        this.kind[idx] = kind;
        this.facing[idx] = facingIndex;
    }
    clearAtIdx(idx) {
        this.kind[idx] = FLOOR_CELL_KIND.None;
        this.facing[idx] = 0;
    }
    hasAny() {
        const size = this.kind.length;
        for (let idx = 0; idx < size; idx++) if (this.kind[idx] !== FLOOR_CELL_KIND.None) return true;
        return false;
    }
}
