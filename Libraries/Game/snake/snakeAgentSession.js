import { aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
export function createSnakeAgentSession(state, { registry, navWalkable, speciesById }) {
    return { registry, speciesById, instancesByHeadId: registry.instancesByHeadId, engagementByHeadId: new Map(), navWalkable, simTick: 0, lastVisionBeginTick: -1 };
}
export function registerAgentInstance(session, speciesId, instance) {
    const def = session.speciesById.get(speciesId);
    if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
    def.register(session, instance);
}
export function validateAliveAgents(session, state) {
    for (const instance of [...aliveAgentInstances(session.registry)]) instance.validate(state, session);
}
export function tickAliveAgents(session, state, dtMs) {
    for (const instance of aliveAgentInstances(session.registry)) instance.tick(state, dtMs);
}
export function syncAgentsAfterPhysics(session, state) {
    for (const instance of aliveAgentInstances(session.registry)) {
        const def = session.speciesById.get(instance.profileId);
        instance.syncMembersFromGraph(state);
        if (def.pressureDiagnostics) instance.updatePressureDiagnostics(state);
    }
}
export function stopAllAgents(session, state) {
    for (const instance of aliveAgentInstances(session.registry)) instance.stopSteering(state);
}
export function spawnSpeciesBatch(session, state, speciesId, spawnCtxs) {
    const def = session.speciesById.get(speciesId);
    if (!def) return [];
    const instances = [];
    for (let i = 0; i < spawnCtxs.length; i++) {
        const instance = def.createInstance(state, spawnCtxs[i]);
        registerAgentInstance(session, speciesId, instance);
        instance.start(state);
        instances.push(instance);
    }
    return instances;
}
