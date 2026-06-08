/** Minimum edge length (px) for a splittable crate piece before it is treated as terminal debris. */
export const SPLITTABLE_MIN_PIECE_SIZE = 3;
/** @param {object} pickup */
export function getSplittablePickupSize(pickup) {
    return { width: pickup.halfExtents ? pickup.halfExtents.x * 2 : pickup.radius * 2, height: pickup.halfExtents ? pickup.halfExtents.y * 2 : pickup.radius * 2 };
}
/** @param {object} pickup @param {number} [minSize] */
export function canSplittablePickupSplit(pickup, minSize = SPLITTABLE_MIN_PIECE_SIZE) {
    if (!pickup?.strategy?.splittable) return false;
    const { width, height } = getSplittablePickupSize(pickup);
    return width >= minSize * 2 && height >= minSize * 2;
}
