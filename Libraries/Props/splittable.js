/** Minimum edge length (px) for a splittable crate piece before it is treated as terminal debris. */
export const SPLITTABLE_MIN_PIECE_SIZE = 3;
/** @param {object} prop */
export function getSplittablePropSize(prop) {
    return { width: prop.halfExtents ? prop.halfExtents.x * 2 : prop.radius * 2, height: prop.halfExtents ? prop.halfExtents.y * 2 : prop.radius * 2 };
}
/** @param {object} prop @param {number} [minSize] */
export function canSplittableWorldPropSplit(prop, minSize = SPLITTABLE_MIN_PIECE_SIZE) {
    if (!prop?.strategy?.splittable) return false;
    const { width, height } = getSplittablePropSize(prop);
    return width >= minSize * 2 && height >= minSize * 2;
}
