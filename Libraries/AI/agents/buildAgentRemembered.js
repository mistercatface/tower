/** @typedef {{ key: string, memoryKey?: string, allyCount?: number, constant?: null }} AgentRememberedSlot */
export function buildAgentRememberedInto(remembered, memoryWorld, memorySource, slots) {
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const { key, memoryKey = key } = slot;
        if (Object.hasOwn(slot, "constant")) {
            remembered[key] = slot.constant;
            continue;
        }
        if (slot.allyCount != null) {
            remembered[key] = memorySource?.[memoryKey] ? (memoryWorld?.allyCount ?? slot.allyCount) : 0;
            continue;
        }
        remembered[key] = memorySource?.[memoryKey] ? (memoryWorld?.[memoryKey] ?? null) : null;
    }
    return remembered;
}
export function buildAgentRemembered(memoryWorld, memorySource, slots) {
    return buildAgentRememberedInto({}, memoryWorld, memorySource, slots);
}
