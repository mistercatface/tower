export function createFlowReachStaleCache({ maxEntries = 512, staleTicks = 3 } = {}) {
    const slotByKey = new Map();
    const keys = new Float64Array(maxEntries);
    const stepsBySlot = new Int32Array(maxEntries);
    const ticksBySlot = new Int32Array(maxEntries);
    let count = 0;
    let nextEvict = 0;
    let cacheToken = "";
    return {
        remember(key, steps, tickId, token) {
            if (token !== cacheToken) {
                this.clear();
                cacheToken = token;
            }
            let slot = slotByKey.get(key);
            if (slot == null) {
                if (count < maxEntries) slot = count++;
                else {
                    slot = nextEvict;
                    slotByKey.delete(keys[slot]);
                    nextEvict = (nextEvict + 1) % maxEntries;
                }
                keys[slot] = key;
                slotByKey.set(key, slot);
            }
            stepsBySlot[slot] = steps;
            ticksBySlot[slot] = tickId;
        },
        lookup(key, tickId, token) {
            if (token !== cacheToken) return null;
            const slot = slotByKey.get(key);
            if (slot == null) return null;
            if (tickId - ticksBySlot[slot] <= staleTicks) return stepsBySlot[slot];
            return null;
        },
        clear() {
            slotByKey.clear();
            count = 0;
            nextEvict = 0;
        },
    };
}
