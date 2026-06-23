import { isAgentEngaged } from "./agentEngagement.js";
import { buildAgentRememberedInto } from "./buildAgentRemembered.js";
function resolveEngagedAlly(visibleWorld, remembered, input) {
    let ally = visibleWorld.ally;
    const session = input.session ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    if (!ally && input.memorySource?.ally) ally = input.memoryWorld?.ally ?? remembered.ally ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    return ally;
}
function mergeKnownSlot(slotKey, slotDef, visible, remembered, visibleWorld, input) {
    const merge = slotDef.known ?? "worldOrRemembered";
    if (merge === "engagedAlly") return resolveEngagedAlly(visibleWorld, remembered, input);
    if (merge === "visibleOrRemembered") return visible[slotKey] ?? remembered[slotKey] ?? null;
    return visibleWorld[slotKey] ?? remembered[slotKey] ?? null;
}
function visibleSlotValue(slotKey, slotDef, visibleWorld, memorySource) {
    const memoryKey = slotDef.memoryKey ?? slotKey;
    if (slotDef.hideVisibleWhenMemory && memorySource?.[memoryKey]) return null;
    return visibleWorld[slotDef.visibleFrom ?? slotKey] ?? null;
}
function copyVisibleField(fieldDef, visibleWorld, memorySource) {
    if (fieldDef.ifMemory && memorySource?.[fieldDef.ifMemory.key]) return fieldDef.ifMemory.use;
    return visibleWorld[fieldDef.from] ?? fieldDef.default ?? null;
}
function copyKnownField(fieldDef, visible, remembered, visibleWorld, known) {
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
export function mergeSlotsFromSchemaInto(frame, schema, visibleWorld, memoryWorld, memorySource, input) {
    buildAgentRememberedInto(frame.remembered, memoryWorld, memorySource, schema.remembered);
    for (const slotKey of Object.keys(schema.slots)) frame.visible[slotKey] = visibleSlotValue(slotKey, schema.slots[slotKey], visibleWorld, memorySource);
    if (schema.fields)
        for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) if (fieldDef.visible != null) frame.visible[fieldKey] = copyVisibleField(fieldDef.visible, visibleWorld, memorySource);
    for (const [slotKey, slotDef] of Object.entries(schema.slots)) frame.known[slotKey] = mergeKnownSlot(slotKey, slotDef, frame.visible, frame.remembered, visibleWorld, input);
    if (schema.fields)
        for (const [fieldKey, fieldDef] of Object.entries(schema.fields))
            if (fieldDef.known != null) frame.known[fieldKey] = copyKnownField(fieldDef.known, frame.visible, frame.remembered, visibleWorld, frame.known);
    return frame;
}
export function mergeSlotsFromSchema(schema, visibleWorld, memoryWorld, memorySource, input) {
    const frame = { visible: {}, remembered: {}, known: {} };
    return mergeSlotsFromSchemaInto(frame, schema, visibleWorld, memoryWorld, memorySource, input);
}
