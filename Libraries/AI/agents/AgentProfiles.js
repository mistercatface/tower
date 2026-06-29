import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
// ==========================================
// Agent Profile Definitions
// ==========================================
export const AGENT_PROFILE = Object.freeze({ snake: "snake", flee: "flee_agent", squid: "squid" });
export function getAgentProfile(profileId, config = getSnakeGameConfig()) {
    const profile = config.agentProfiles?.[profileId];
    if (!profile) throw new Error(`unknown agent profile: ${profileId}`);
    return profile;
}
// ==========================================
// Population Registry
// ==========================================
export function createAgentPopulationRegistry() {
    return { instancesByHeadId: new Map(), instancesByMemberId: new Map(), deadHeadIds: new Set(), inertByLeadId: new Map() };
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
    const instance = registry.instancesByHeadId.get(headId);
    if (instance) for (let i = 0; i < instance.memberIds.length; i++) registry.instancesByMemberId.delete(instance.memberIds[i]);
    registry.instancesByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function purgeInertAgentsForHead(registry, headId) {
    for (const [leadId, entry] of registry.inertByLeadId) if (entry.sourceHeadId === headId) registry.inertByLeadId.delete(leadId);
}
export function isAliveAgentHead(registry, headId) {
    return registry.instancesByHeadId.get(headId)?.lifecycle === "alive";
}
// ==========================================
// Agent Engagement (Combat/Action states)
// ==========================================
export function publishAgentEngagement(session, headId, engagementState) {
    if (!session || headId == null) return;
    if (!session.engagementByHeadId) session.engagementByHeadId = new Map();
    session.engagementByHeadId.set(headId, engagementState);
}
export function readAgentEngagement(session, headId) {
    return session?.engagementByHeadId?.get(headId) ?? null;
}
export function isAgentEngaged(session, headId) {
    return readAgentEngagement(session, headId)?.active === true;
}
