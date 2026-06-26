import { aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { createAgentFrameOrchestrator } from "./agentFrameOrchestrator.js";
import { syncBallAgentFacingAfterPhysics } from "./ballAgent.js";
export function createSnakeAgentSession({ registry, navWalkable, speciesById }) {
    const config = getSnakeGameConfig();
    const orchestrator = createAgentFrameOrchestrator(config.aiBudget);
    return {
        config,
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
export function tickAliveAgents(session, state, dtMs) {
    session.lastDtMs = dtMs;
    session.orchestrator.beginFrame(state.sandbox.snakeGame.simTick, session.registry.instancesByHeadId.size);
    for (const instance of aliveAgentInstances(session.registry)) {
        const admitted = session.orchestrator.shouldThink(instance, state, state.viewport);
        instance.tick(dtMs, admitted);
    }
    session.orchestrator.endFrame();
}
export function syncAgentsAfterPhysics(session, state) {
    const dtMs = session.lastDtMs ?? 16;
    for (const instance of aliveAgentInstances(session.registry)) {
        const def = session.speciesById.get(instance.profileId);
        instance.syncMembersFromGraph();
        if (def.pressureDiagnostics) instance.updatePressureDiagnostics(state);
        syncBallAgentFacingAfterPhysics(instance, instance._lastTickDtMs ?? dtMs);
    }
}
export function stopAllAgents(session) {
    for (const instance of aliveAgentInstances(session.registry)) instance.stopSteering();
}
export function spawnSpeciesBatch(session, state, speciesId, spawnCtxs) {
    const def = session.speciesById.get(speciesId);
    if (!def) return [];
    const instances = [];
    for (let i = 0; i < spawnCtxs.length; i++) {
        const instance = def.createInstance(state, spawnCtxs[i]);
        registerAgentInstance(session, speciesId, instance);
        instance.start();
        instances.push(instance);
    }
    return instances;
}
