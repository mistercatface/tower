import { aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { createAgentFrameOrchestrator } from "./agentFrameOrchestrator.js";
export function createSnakeAgentSession(state, { registry, navWalkable, speciesById }) {
    const config = getSnakeGameConfig();
    const orchestrator = createAgentFrameOrchestrator(config.aiBudget);
    return {
        registry,
        speciesById,
        instancesByHeadId: registry.instancesByHeadId,
        engagementByHeadId: new Map(),
        navWalkable,
        simTick: 0,
        lastVisionBeginTick: -1,
        focusedInstance: null,
        orchestrator,
        activeGunBulletIds: [],
        spentGunBulletIds: [],
    };
}
export function registerAgentInstance(session, speciesId, instance) {
    const def = session.speciesById.get(speciesId);
    if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
    def.register(session, instance);
}
export function validateAliveAgents(session, state) {
    for (const instance of [...aliveAgentInstances(session.registry)]) instance.validate(state);
}
export function tickAliveAgents(session, state, dtMs) {
    session.orchestrator.beginFrame(state.sandbox.snakeGame.simTick);
    for (const instance of aliveAgentInstances(session.registry)) {
        const admitted = session.orchestrator.shouldThink(instance, state, state.viewport);
        instance.tick(state, dtMs, admitted);
    }
    session.orchestrator.endFrame();
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
