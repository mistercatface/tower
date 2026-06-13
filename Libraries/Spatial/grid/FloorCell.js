import { CARDINAL_FACING_STEPS, quantizeCardinalAngle } from "../../Math/Angle.js";
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
/** @param {number} kind @returns {"left" | "right" | null} */
export function floorBeltElbowTurn(kind) {
    if (kind === FLOOR_CELL_KIND.BeltElbowLeft || kind === FLOOR_CELL_KIND.BeltElbowLeftRails) return "left";
    if (kind === FLOOR_CELL_KIND.BeltElbowRight || kind === FLOOR_CELL_KIND.BeltElbowRightRails) return "right";
    return null;
}
/** Perpendicular cell-edge indices (0=N,1=E,2=S,3=W) that block lateral escape. */
export function floorBeltRailEdgeSidesForFacingIndex(facingIndex) {
    return facingIndex % 2 === 0 ? [0, 2] : [1, 3];
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
