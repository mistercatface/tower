export function createAgentPopulationRegistry() {
    return { instancesByHeadId: new Map(), deadHeadIds: new Set(), inertByLeadId: new Map() };
}
export function registerAliveAgent(registry, headId, _species, instance) {
    registry.instancesByHeadId.set(headId, instance);
    registry.deadHeadIds.delete(headId);
}
export function* aliveAgentInstances(registry) {
    for (const instance of registry.instancesByHeadId.values()) if (instance.lifecycle === "alive") yield instance;
}
export function registerInertAgent(registry, leadSegmentId, memberIds, sourceHeadId) {
    registry.inertByLeadId.set(leadSegmentId, { leadSegmentId, memberIds, sourceHeadId, lifecycle: "inert" });
}
export function markAgentDead(registry, headId) {
    registry.instancesByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function purgeInertAgentsForHead(registry, headId) {
    for (const [leadId, entry] of registry.inertByLeadId) if (entry.sourceHeadId === headId) registry.inertByLeadId.delete(leadId);
}
export function isAliveAgentHead(registry, headId) {
    return registry.instancesByHeadId.get(headId)?.lifecycle === "alive";
}
