export function createSnakeAgentSession(state, { registry, navWalkable, speciesById }) {
    return { registry, speciesById, instancesByHeadId: registry.instancesByHeadId, autosimsByHeadId: new Map(), engagementByHeadId: new Map(), navWalkable, simTick: 0, lastVisionBeginTick: -1 };
}
export function registerAgentInstance(session, speciesId, instance) {
    const def = session.speciesById.get(speciesId);
    if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
    def.register(session, instance);
}
export function validateAliveAgents(session, state) {
    for (const instance of [...session.instancesByHeadId.values()]) {
        if (instance.lifecycle !== "alive") continue;
        const speciesMeta = session.registry.aliveByHeadId.get(instance.headId);
        if (!speciesMeta) continue;
        const def = session.speciesById.get(speciesMeta.species);
        if (def?.validate) def.validate(instance, state, session);
    }
}
export function tickAliveAgents(session, state, dtMs) {
    for (const instance of session.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        const speciesMeta = session.registry.aliveByHeadId.get(instance.headId);
        if (!speciesMeta) continue;
        const def = session.speciesById.get(speciesMeta.species);
        if (def?.tick) def.tick(instance, state, dtMs);
    }
}
export function syncAgentsAfterPhysics(session, state) {
    for (const instance of session.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        const speciesMeta = session.registry.aliveByHeadId.get(instance.headId);
        if (!speciesMeta) continue;
        const def = session.speciesById.get(speciesMeta.species);
        if (def?.syncMembers) def.syncMembers(instance, state);
        if (def?.syncAfterPhysics) def.syncAfterPhysics(instance, state);
        if (def?.syncPresentation) def.syncPresentation(instance, state);
        if (def?.updateDiagnostics) def.updateDiagnostics(instance, state);
    }
}
export function stopAllAgents(session, state) {
    for (const instance of session.instancesByHeadId.values()) {
        const speciesMeta = session.registry.aliveByHeadId.get(instance.headId);
        if (!speciesMeta) continue;
        const def = session.speciesById.get(speciesMeta.species);
        if (def?.stop) def.stop(instance, state);
    }
}
export function resolveAgentRelationship(session, seekerId, targetId, state) {
    const seekerMeta = session.registry.aliveByHeadId.get(seekerId);
    const targetMeta = session.registry.aliveByHeadId.get(targetId);
    if (!seekerMeta || !targetMeta) return "neutral";
    const def = session.speciesById.get(seekerMeta.species);
    if (def?.resolveRelationship) return def.resolveRelationship(targetMeta.species, seekerId, targetId, state, session);
    return "neutral";
}
export function spawnSpeciesBatch(session, state, speciesId, spawnCtxs) {
    const def = session.speciesById.get(speciesId);
    if (!def) return [];
    const instances = [];
    for (let i = 0; i < spawnCtxs.length; i++) {
        const instance = def.createInstance(state, spawnCtxs[i]);
        registerAgentInstance(session, speciesId, instance);
        if (def.start) def.start(instance, state);
        instances.push(instance);
    }
    return instances;
}
