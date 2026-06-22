export function createAgentPopulationRegistry() {
    return { instancesByHeadId: new Map(), aliveByHeadId: new Map(), deadHeadIds: new Set(), inertByLeadId: new Map() };
}
export function registerAliveAgent(registry, headId, species, instance) {
    registry.instancesByHeadId.set(headId, instance);
    registry.aliveByHeadId.set(headId, { headId, species, lifecycle: "alive" });
    registry.deadHeadIds.delete(headId);
}
export function registerInertAgent(registry, leadSegmentId, memberIds, sourceHeadId) {
    registry.inertByLeadId.set(leadSegmentId, { leadSegmentId, memberIds, sourceHeadId, lifecycle: "inert" });
}
export function markAgentDead(registry, headId) {
    registry.aliveByHeadId.delete(headId);
    registry.instancesByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function isAliveAgentHead(registry, headId) {
    return registry.aliveByHeadId.has(headId);
}
export function purgeInertAgentsForHead(registry, headId) {
    for (const [leadId, entry] of registry.inertByLeadId) if (entry.sourceHeadId === headId) registry.inertByLeadId.delete(leadId);
}
