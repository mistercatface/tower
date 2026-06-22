export function createSnakeAgentSession(state, { registry, navWalkable, speciesById }) {
    return {
        registry,
        speciesById,
        instancesByHeadId: registry.instancesByHeadId,
        autosimsByHeadId: new Map(),
        navWalkable,
        simTick: 0,
        lastVisionBeginTick: -1,
    };
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
