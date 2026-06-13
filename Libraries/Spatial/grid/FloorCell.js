import { CARDINAL_FACING_STEPS, quantizeCardinalAngle } from "../../Math/Angle.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3 };
/** @param {number} kind */
export function isFloorBeltKind(kind) {
    return kind === FLOOR_CELL_KIND.Belt || kind === FLOOR_CELL_KIND.BeltElbowLeft || kind === FLOOR_CELL_KIND.BeltElbowRight;
}
/** @param {number} kind @returns {"left" | "right" | null} */
export function floorBeltElbowTurn(kind) {
    if (kind === FLOOR_CELL_KIND.BeltElbowLeft) return "left";
    if (kind === FLOOR_CELL_KIND.BeltElbowRight) return "right";
    return null;
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
