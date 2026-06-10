/**
 * @param {Record<string, { factor: number, of?: string } | number>} refTable
 * @param {string} refName
 * @param {number} ballRadius
 */
export function resolveRefValue(refTable, refName, ballRadius) {
    const entry = refTable[refName];
    if (entry == null) throw new Error(`Unknown ref "${refName}"`);
    if (typeof entry === "number") return ballRadius * entry;
    if (entry.of === "ballRadius" || entry.of == null) return ballRadius * entry.factor;
    throw new Error(`Unsupported ref.of "${entry.of}" for "${refName}"`);
}
/** @param {Record<string, { factor: number, of?: string } | number>} voidRadii @param {number} ballRadius */
export function resolveVoidRadiiRefs(voidRadii, ballRadius) {
    /** @type {Record<string, number>} */
    const resolved = {};
    for (const key of Object.keys(voidRadii)) resolved[key] = resolveRefValue(voidRadii, key, ballRadius);
    return resolved;
}
export {};
