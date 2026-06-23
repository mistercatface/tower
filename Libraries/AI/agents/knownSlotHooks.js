import { isAgentEngaged } from "./agentEngagement.js";
function resolveEngagedAlly(visibleWorld, remembered, input) {
    let ally = visibleWorld.ally;
    const session = input.session ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    if (!ally && input.memorySource?.ally) ally = input.memoryWorld?.ally ?? remembered.ally ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    return ally;
}
const KNOWN_MERGE = {
    worldOrRemembered(slotKey, visibleWorld, remembered) {
        return visibleWorld[slotKey] ?? remembered[slotKey] ?? null;
    },
    visibleOrRemembered(slotKey, visible, remembered) {
        return visible[slotKey] ?? remembered[slotKey] ?? null;
    },
    engagedAlly(_slotKey, visibleWorld, remembered, input) {
        return resolveEngagedAlly(visibleWorld, remembered, input);
    },
};
export function mergeKnownSlot(slotKey, slotDef, visible, remembered, visibleWorld, input) {
    const merge = slotDef.known ?? "worldOrRemembered";
    if (merge === "engagedAlly") return KNOWN_MERGE.engagedAlly(slotKey, visibleWorld, remembered, input);
    if (merge === "visibleOrRemembered") return KNOWN_MERGE.visibleOrRemembered(slotKey, visible, remembered);
    return KNOWN_MERGE.worldOrRemembered(slotKey, visibleWorld, remembered);
}
export function visibleSlotValue(slotKey, slotDef, visibleWorld, memorySource) {
    const memoryKey = slotDef.memoryKey ?? slotKey;
    if (slotDef.hideVisibleWhenMemory && memorySource?.[memoryKey]) return null;
    const worldKey = slotDef.visibleFrom ?? slotKey;
    return visibleWorld[worldKey] ?? null;
}
/** @param {{ from: string, default?: unknown, ifMemory?: { key: string, use: unknown } }} fieldDef */
export function copyVisibleField(fieldDef, visibleWorld, memorySource) {
    if (fieldDef.ifMemory && memorySource?.[fieldDef.ifMemory.key]) return fieldDef.ifMemory.use;
    return visibleWorld[fieldDef.from] ?? fieldDef.default ?? null;
}
/**
 * Known field rules (no string hooks):
 * - `{ fromVisible, default? }` — copy from visible bag
 * - `{ visibleIfSlot, fromVisible, fromRemembered }` — flee ally count
 * - `{ anchorSlot, matchWorldSlot, fromVisible, fromRemembered?, whenMissing?, whenNoMatch? }` — snake ally meta
 */
export function copyKnownField(fieldDef, visible, remembered, visibleWorld, known) {
    if (fieldDef.fromVisible != null && fieldDef.visibleIfSlot == null && fieldDef.anchorSlot == null) return visible[fieldDef.fromVisible] ?? fieldDef.default ?? null;
    if (fieldDef.visibleIfSlot != null)
        return visible[fieldDef.visibleIfSlot] ? (visible[fieldDef.fromVisible] ?? remembered[fieldDef.fromRemembered] ?? null) : (remembered[fieldDef.fromRemembered] ?? null);
    if (fieldDef.anchorSlot != null) {
        const anchor = known[fieldDef.anchorSlot];
        if (!anchor) return fieldDef.whenMissing ?? null;
        const worldTarget = visibleWorld[fieldDef.matchWorldSlot];
        if (worldTarget?.id !== anchor.id) {
            if (Object.hasOwn(fieldDef, "whenNoMatch")) return fieldDef.whenNoMatch;
            return remembered[fieldDef.fromRemembered] ?? null;
        }
        return visible[fieldDef.fromVisible] ?? null;
    }
    return visibleWorld[fieldDef.from] ?? remembered[fieldDef.from] ?? fieldDef.default ?? null;
}
