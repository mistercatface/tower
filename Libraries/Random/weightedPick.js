/**
 * Pick one item by weight. Falls back to the last item if floating-point drift skips all buckets.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T, index: number) => number} [getWeight]
 * @param {() => number} [random]
 * @returns {T | undefined}
 */
export function weightedPick(items, getWeight = (item) => /** @type {{ weight?: number }} */ (item).weight ?? 1, random = Math.random) {
    if (!items.length) return undefined;
    const totalWeight = items.reduce((sum, item, index) => sum + Math.max(0, getWeight(item, index)), 0);
    if (totalWeight <= 0) return items[items.length - 1];
    let rand = random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        const weight = Math.max(0, getWeight(items[i], i));
        if (rand < weight) return items[i];
        rand -= weight;
    }
    return items[items.length - 1];
}
