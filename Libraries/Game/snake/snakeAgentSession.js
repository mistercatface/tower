import { aliveAgentInstances } from "../../AI/agents/AgentProfiles.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export class AgentFrameOrchestrator {
    constructor(config) {
        this.config = config;
        this.frameId = 0;
        this.thinksUsed = 0;
        this.spreadFrames = 1;
    }
    beginFrame(frameId, agentCount = 0) {
        this.frameId = frameId;
        this.thinksUsed = 0;
        const budget = Math.max(1, this.config.thinkPerFrame);
        this.spreadFrames = Math.max(1, Math.ceil(agentCount / budget));
    }
    shouldThink(instance, state, viewport) {
        const head = instance.head;
        if (!head || head.isDead) return false;
        const isFocused = state.followCamera?.targetProp?.id === head.id;
        if (isFocused && this.config.focusedThinkEveryFrame) {
            this.thinksUsed++;
            instance._lastThinkFrame = this.frameId;
            return true;
        }
        const onScreen = viewport.circleInBounds(head.x, head.y, head.radius * 2, "props");
        const interval = onScreen ? this.config.onScreenThinkInterval : this.config.offScreenThinkInterval;
        const framesSince = this.frameId - (instance._lastThinkFrame ?? -999);
        if (this.frameId % this.spreadFrames !== head.id % this.spreadFrames) return false;
        if (framesSince >= interval)
            if (this.thinksUsed < this.config.thinkPerFrame) {
                this.thinksUsed++;
                instance._lastThinkFrame = this.frameId;
                return true;
            }
        return false;
    }
    endFrame() {
        // Hook for future end-of-frame telemetry or diagnostics
    }
}
export class SnakeAgentSession {
    constructor({ registry, navWalkable, speciesById }) {
        this.config = getSnakeGameConfig();
        this.registry = registry;
        this.speciesById = speciesById;
        this.instancesByHeadId = registry.instancesByHeadId;
        this.instancesByMemberId = registry.instancesByMemberId;
        this.engagementByHeadId = new Map();
        this.navWalkable = navWalkable;
        this.simTick = 0;
        this.lastVisionBeginTick = -1;
        this.orchestrator = new AgentFrameOrchestrator(this.config.aiBudget);
        this.activeGunBulletIds = [];
        this.lastDtMs = 0;
    }
    registerAgentInstance(speciesId, instance) {
        const def = this.speciesById.get(speciesId);
        if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
        def.register(this, instance);
    }
    tick(state, dtMs) {
        this.lastDtMs = dtMs;
        this.orchestrator.beginFrame(state.sandbox.snakeGame.simTick, this.registry.instancesByHeadId.size);
        for (const instance of aliveAgentInstances(this.registry)) {
            const admitted = this.orchestrator.shouldThink(instance, state, state.viewport);
            instance.autosim.tick(dtMs, admitted);
        }
        this.orchestrator.endFrame();
    }
    syncAfterPhysics(state) {
        const dtMs = this.lastDtMs;
        for (const instance of aliveAgentInstances(this.registry)) {
            const def = this.speciesById.get(instance.profileId);
            instance.syncMembersFromGraph();
            if (def.pressureDiagnostics) instance.updatePressureDiagnostics(state);
            instance.syncBallAgentFacingAfterPhysics(dtMs);
        }
    }
    stopAll() {
        for (const instance of aliveAgentInstances(this.registry)) instance.stopSteering();
    }
    spawnBatch(state, speciesId, spawnCtxs) {
        const def = this.speciesById.get(speciesId);
        if (!def) return [];
        const instances = [];
        for (let i = 0; i < spawnCtxs.length; i++) {
            const instance = def.createInstance(state, spawnCtxs[i]);
            this.registerAgentInstance(speciesId, instance);
            instance.start();
            instances.push(instance);
        }
        return instances;
    }
}
// ==========================================
// Compatibility Wrappers for Tests
// ==========================================
export function createSnakeAgentSession(options) {
    return new SnakeAgentSession(options);
}
export function registerAgentInstance(session, speciesId, instance) {
    session.registerAgentInstance(speciesId, instance);
}
export function tickAliveAgents(session, state, dtMs) {
    session.tick(state, dtMs);
}
export function syncAgentsAfterPhysics(session, state) {
    session.syncAfterPhysics(state);
}
export function stopAllAgents(session) {
    session.stopAll();
}
export function spawnSpeciesBatch(session, state, speciesId, spawnCtxs) {
    return session.spawnBatch(state, speciesId, spawnCtxs);
}
