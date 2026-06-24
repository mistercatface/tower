import { aliveAgentRecords } from "../../AI/agents/agentPopulationRegistry.js";
import { resolveRelationshipForInstances } from "./agentRelationships.js";
export function createSnakeAgentSession(state, { registry, navWalkable, speciesById }) {
    return { registry, speciesById, instancesByHeadId: registry.instancesByHeadId, engagementByHeadId: new Map(), navWalkable, simTick: 0, lastVisionBeginTick: -1 };
}
export function registerAgentInstance(session, speciesId, instance) {
    const def = session.speciesById.get(speciesId);
    if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
    def.register(session, instance);
}
export function validateAliveAgents(session, state) {
    for (const record of [...aliveAgentRecords(session.registry)]) {
        const { instance } = record;
        if (instance.lifecycle !== "alive") continue;
        const def = session.speciesById.get(record.species);
        if (def.validate) def.validate(instance, state, session);
    }
}
export function tickAliveAgents(session, state, dtMs) {
    for (const record of aliveAgentRecords(session.registry)) {
        const { instance } = record;
        if (instance.lifecycle !== "alive") continue;
        const def = session.speciesById.get(record.species);
        if (def.tick) def.tick(instance, state, dtMs);
    }
}
export function syncAgentsAfterPhysics(session, state) {
    for (const record of aliveAgentRecords(session.registry)) {
        const { instance } = record;
        if (instance.lifecycle !== "alive") continue;
        const def = session.speciesById.get(record.species);
        if (def.syncMembers) def.syncMembers(instance, state);
        if (def.syncAfterPhysics) def.syncAfterPhysics(instance, state);
        if (def.syncPresentation) def.syncPresentation(instance, state);
        if (def.updateDiagnostics) def.updateDiagnostics(instance, state);
    }
}
export function stopAllAgents(session, state) {
    for (const record of aliveAgentRecords(session.registry)) {
        const { instance } = record;
        const def = session.speciesById.get(record.species);
        if (def.stop) def.stop(instance, state);
    }
}
export function resolveAgentRelationship(session, seekerInstance, targetInstance, distSq = null) {
    return resolveRelationshipForInstances(seekerInstance, targetInstance, undefined, distSq);
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
