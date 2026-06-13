import { CARDINAL_FACING_STEPS, quantizeCardinalAngle } from "../../Math/Angle.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1 };
/** @param {number} cardinalIndex 0…3 */
export function floorBeltFacingFromIndex(cardinalIndex) {
    return (cardinalIndex % CARDINAL_FACING_STEPS) * ((Math.PI * 2) / CARDINAL_FACING_STEPS);
}
/** @param {number} facingRadians */
export function floorBeltFacingToIndex(facingRadians) {
    const q = quantizeCardinalAngle(facingRadians);
    return Math.round(q / ((Math.PI * 2) / CARDINAL_FACING_STEPS)) % CARDINAL_FACING_STEPS;
}
