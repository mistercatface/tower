import { CARDINAL_FACING_STEPS, quantizeCardinalAngle } from "../../Math/Angle.js";
import { cellInRect } from "./GridUtils.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3, BeltRails: 4, BeltElbowLeftRails: 5, BeltElbowRightRails: 6, PassagePowerSource: 7 };
/** @param {number} kind */
export function isFloorBeltKind(kind) {
    return kind >= FLOOR_CELL_KIND.Belt && kind <= FLOOR_CELL_KIND.BeltElbowRightRails;
}
/** @param {number} kind */
export function isPassagePowerSourceKind(kind) {
    return kind === FLOOR_CELL_KIND.PassagePowerSource;
}
/** @param {number} kind */
export function isFloorBeltRailsKind(kind) {
    return kind === FLOOR_CELL_KIND.BeltRails || kind === FLOOR_CELL_KIND.BeltElbowLeftRails || kind === FLOOR_CELL_KIND.BeltElbowRightRails;
}
/** @param {number} kind @returns {"left" | "right" | null} */
export function floorBeltElbowTurn(kind) {
    if (kind === FLOOR_CELL_KIND.BeltElbowLeft || kind === FLOOR_CELL_KIND.BeltElbowLeftRails) return "left";
    if (kind === FLOOR_CELL_KIND.BeltElbowRight || kind === FLOOR_CELL_KIND.BeltElbowRightRails) return "right";
    return null;
}
/**
 * Entry/exit cell edges (0=N,1=E,2=S,3=W) from belt geometry + cardinal facing.
 * Straight: flow along facing. Elbows: W→N (left) / W→S (right) at facing 0, rotated by facing index.
 */
export function floorBeltEntryExitSides(kind, facingIndex) {
    const f = facingIndex % CARDINAL_FACING_STEPS;
    const turn = floorBeltElbowTurn(kind);
    if (!turn) {
        const exitSide = (f + 1) % CARDINAL_FACING_STEPS;
        const entrySide = (f + 3) % CARDINAL_FACING_STEPS;
        return { entrySide, exitSide };
    }
    if (turn === "left") return { entrySide: (2 + f) % CARDINAL_FACING_STEPS, exitSide: (1 + f) % CARDINAL_FACING_STEPS };
    return { entrySide: (0 + f) % CARDINAL_FACING_STEPS, exitSide: (1 + f) % CARDINAL_FACING_STEPS };
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
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} entrySide */
export function floorBeltEntryEdgeWorldPoint(grid, col, row, entrySide) {
    const { x, y } = grid.gridToWorld(col, row);
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
    const { col, row } = grid.worldToGrid(x, y);
    return isFloorBeltCell(grid, col, row);
}
/**
 * Steer target when a click lands on a belt — approach from entry, not downstream through rails.
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function resolveFloorBeltSteerTarget(grid, worldX, worldY, fromX, fromY) {
    const { col, row } = grid.worldToGrid(worldX, worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return { x: worldX, y: worldY };
    const idx = col + row * grid.cols;
    const kind = grid.floorStore.kind[idx];
    if (!grid.floorStore.isBeltKindAtIdx(idx)) return { x: worldX, y: worldY };
    const { col: fromCol, row: fromRow } = grid.worldToGrid(fromX, fromY);
    if (fromCol === col && fromRow === row) return { x: worldX, y: worldY };
    const { entrySide } = floorBeltEntryExitSides(kind, grid.floorStore.facing[idx]);
    return floorBeltEntryEdgeWorldPoint(grid, col, row, entrySide);
}
