/**
 * Deterministic RNG scope — patches Math.random only for the duration of `fn`.
 *
 * @template T
 * @param {number} seed
 * @param {() => T} fn
 * @returns {T}
 */
export function withSeededRandom(seed, fn) {
    let s = seed >>> 0 || 1;
    const savedRandom = Math.random;
    Math.random = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
    try {
        return fn();
    } finally {
        Math.random = savedRandom;
    }
}
export function shuffleInPlace(items, rng = Math.random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
    }
    return items;
}
