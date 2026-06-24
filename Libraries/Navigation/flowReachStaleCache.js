export function createFlowReachStaleCache({ maxEntries = 512, staleTicks = 3 } = {}) {
    const cache = new Map();

    return {
        remember(key, steps, tickId) {
            if (cache.size >= maxEntries && !cache.has(key)) {
                // simple eviction (first item)
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set(key, { steps, tick: tickId });
        },
        lookup(key, tickId) {
            const entry = cache.get(key);
            if (!entry) return null;
            if (tickId - entry.tick <= staleTicks) {
                return entry.steps;
            }
            return null;
        },
        clear() {
            cache.clear();
        }
    };
}
