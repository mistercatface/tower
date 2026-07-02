import { aliveAgentInstances, AGENT_PROFILE, getAgentProfile, registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../AI/agents/AgentProfiles.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { clearChainLinksForMembers } from "../../Sandbox/chainLinks.js";
import { markSnakeSegmentsFracturable, shatterSnakeSegments } from "./snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp, AgentInstance } from "./AgentInstance.js";
import { removeWorldPropFromState } from "../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { FactionTargetRegistry } from "./snakePerception.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { events } from "../../../Core/EventSystem.js";
import { FLOATING_TEXT_SPAWN_EVENT } from "../../Render/FloatingText.js";
export class AgentCalloutCatalog {
    constructor(config) {
        this.topics = config.topics ?? {};
        this.topicCooldownMs = config.topicCooldownMs ?? {};
    }
    topicPriority(topic) {
        return this.topics[topic]?.priority ?? 0;
    }
    pickPhrase(topic, rng) {
        const phrases = this.topics[topic]?.phrases;
        if (!phrases?.length) return null;
        return phrases[Math.floor(rng() * phrases.length)];
    }
    topicCooldown(topic) {
        return this.topicCooldownMs[topic] ?? 4000;
    }
}
export class AgentCalloutState {
    constructor() {
        this.mode = null;
        this.combatPhase = "idle";
        this.hadVisibleEnemy = false;
        this.lastSpokeAt = 0;
        this.topicSpokeAt = {};
    }
    noteSpoke(topic, now) {
        this.lastSpokeAt = now;
        this.topicSpokeAt[topic] = now;
    }
    canSpeakTopic(topic, now, catalog, agentCooldownMs) {
        if (now - this.lastSpokeAt < agentCooldownMs) return false;
        const topicAt = this.topicSpokeAt[topic] ?? 0;
        return now - topicAt >= catalog.topicCooldown(topic);
    }
    syncFrom(instance, decisionContext) {
        const combat = decisionContext?.combatState;
        const visibleEnemy = combat?.visibleEnemy ?? decisionContext?.visible?.enemy ?? null;
        const hasLos = combat?.hasLineOfSight ?? false;
        this.hadVisibleEnemy = !!visibleEnemy && hasLos;
        this.mode = instance.intent?.getMode() ?? null;
        this.combatPhase = instance.combatAction?.phase ?? "idle";
    }
}
export class FleeAgentCalloutDirector {
    constructor(config, rng = Math.random) {
        this.config = config;
        this.catalog = new AgentCalloutCatalog(config);
        this.rng = rng;
        this.byHeadId = new Map();
        this.recentEmits = [];
        this.elapsedMs = 0;
    }
    beginFrame(dtMs) {
        this.elapsedMs += dtMs;
        const cutoff = this.elapsedMs - 1000;
        let write = 0;
        for (let i = 0; i < this.recentEmits.length; i++) if (this.recentEmits[i] >= cutoff) this.recentEmits[write++] = this.recentEmits[i];
        this.recentEmits.length = write;
    }
    profileAllowed(profileId) {
        if (!this.config.enabled) return false;
        const ids = this.config.profileIds;
        if (!ids?.length) return profileId === AGENT_PROFILE.flee;
        return ids.includes(profileId);
    }
    stateFor(headId) {
        let state = this.byHeadId.get(headId);
        if (!state) {
            state = new AgentCalloutState();
            this.byHeadId.set(headId, state);
        }
        return state;
    }
    detectTopic(instance, calloutState) {
        const intent = instance.intent;
        const mode = intent?.getMode() ?? null;
        const phase = instance.combatAction?.phase ?? "idle";
        const decisionContext = intent?.getDecisionContext?.() ?? null;
        const combat = decisionContext?.combatState;
        const visibleEnemy = combat?.visibleEnemy ?? decisionContext?.visible?.enemy ?? null;
        const hasVisibleEnemy = !!visibleEnemy && (combat?.hasLineOfSight ?? false);
        const candidates = [];
        if (phase === "reloading" && calloutState.combatPhase !== "reloading") candidates.push("reloading");
        if (hasVisibleEnemy && !calloutState.hadVisibleEnemy) candidates.push("enemy_spotted");
        if (mode !== calloutState.mode)
            if (mode === "shoot_enemy" || mode === "seek_enemy") candidates.push("engaging");
            else if (mode === "seek_ally") candidates.push("following");
            else if (mode === "seek_food") candidates.push("getting_food");
            else if (mode === "flee") candidates.push("falling_back");
        if (!candidates.length) return null;
        let best = candidates[0];
        let bestPriority = this.catalog.topicPriority(best);
        for (let i = 1; i < candidates.length; i++) {
            const priority = this.catalog.topicPriority(candidates[i]);
            if (priority > bestPriority) {
                best = candidates[i];
                bestPriority = priority;
            }
        }
        return best;
    }
    passesScreenGate(instance, state) {
        if (!this.config.preferOnScreen) return true;
        const head = instance.head;
        if (!head) return false;
        if (state.followCamera?.targetProp?.id === head.id) return true;
        return state.viewport?.circleInBounds(head.x, head.y, (head.radius ?? 8) * 2, "props") ?? true;
    }
    globalBudgetAvailable() {
        return this.recentEmits.length < (this.config.maxPerSecond ?? 3);
    }
    maybeEmit(state, instance) {
        if (!this.profileAllowed(instance.profileId)) return false;
        if (!this.passesScreenGate(instance, state)) return false;
        const calloutState = this.stateFor(instance.headId);
        const topic = this.detectTopic(instance, calloutState);
        const decisionContext = instance.intent?.getDecisionContext?.() ?? null;
        if (topic && calloutState.canSpeakTopic(topic, this.elapsedMs, this.catalog, this.config.agentCooldownMs ?? 3000) && this.globalBudgetAvailable()) {
            const text = this.catalog.pickPhrase(topic, this.rng);
            if (text) {
                const head = instance.head;
                events.emit(FLOATING_TEXT_SPAWN_EVENT, {
                    state,
                    variant: "custom",
                    x: head.x,
                    y: head.y + (this.config.yOffset ?? -14),
                    text,
                    color: this.config.color ?? "#f1c40f",
                    style: "standard",
                    options: { duration: this.config.duration ?? 1200, vy: -24 },
                });
                this.recentEmits.push(this.elapsedMs);
                calloutState.noteSpoke(topic, this.elapsedMs);
            }
        }
        calloutState.syncFrom(instance, decisionContext);
        return topic != null;
    }
}
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
        this.factionTargetRegistry = new FactionTargetRegistry();
        this.callouts = new FleeAgentCalloutDirector(this.config.agentCallouts ?? { enabled: false });
    }
    registerAgentInstance(speciesId, instance) {
        const def = this.speciesById.get(speciesId);
        if (!def) throw new Error(`Unknown agent species: ${speciesId}`);
        def.register(this, instance);
    }
    tick(state, dtMs) {
        this.lastDtMs = dtMs;
        this.callouts.beginFrame(dtMs);
        this.orchestrator.beginFrame(state.sandbox.snakeGame.simTick, this.registry.instancesByHeadId.size);
        for (const instance of aliveAgentInstances(this.registry)) {
            const admitted = this.orchestrator.shouldThink(instance, state, state.viewport);
            instance.autosim.tick(dtMs, admitted);
            //if (admitted) this.callouts.maybeEmit(state, instance);
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
// Consolidate species and DynamicSpeciesMap logic
// ==========================================
function removeNonStruckSegments(state, connectedMembers, deathImpact, spatialFrame) {
    const struckId = deathImpact?.struckSegmentId ?? null;
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < connectedMembers.length; i++) {
        const segmentId = connectedMembers[i];
        if (segmentId === struckId) continue;
        const segment = state.entityRegistry.getLive(segmentId);
        if (segment) removeWorldPropFromState(state, segment, spatialFrame ?? undefined, meta);
    }
}
export function createAgentSpecies(profileId) {
    const species = getAgentProfile(profileId, getSnakeGameConfig()).species ?? {};
    const retireNavOnDeath = species.retireNavOnDeath === true;
    const fracturableBeforeShatter = species.fracturableBeforeShatter === true;
    const removeNonStruckSegmentsOnDeath = species.removeNonStruckSegments === true;
    const pressureDiagnostics = species.pressureDiagnostics === true;
    return {
        id: profileId,
        pressureDiagnostics,
        createInstance(state, ctx) {
            return new AgentInstance(state, { profileId, head: ctx.head, spawnGroupId: ctx.spawnGroupId });
        },
        register(session, instance) {
            registerAliveAgent(session.registry, instance.headId, profileId, instance);
        },
        die(instance, state, deathImpact = null) {
            instance.lifecycle = "dead";
            instance.stopSteering();
            const spatialFrame = deathImpact?.spatialFrame ?? kineticSpatial;
            const snakeGame = state.sandbox.snakeGame;
            const connectedMembers = instance.syncMembersFromGraph();
            let resolvedMembers = connectedMembers;
            if (retireNavOnDeath) resolvedMembers = instance.retireAllSegments(state, connectedMembers);
            clearChainLinksForMembers(state, resolvedMembers);
            if (fracturableBeforeShatter) markSnakeSegmentsFracturable(state, connectedMembers);
            shatterSnakeSegments(state, spatialFrame, resolvedMembers, deathImpact);
            if (removeNonStruckSegmentsOnDeath) removeNonStruckSegments(state, connectedMembers, deathImpact, spatialFrame);
            purgeInertAgentsForHead(snakeGame.registry, instance.headId);
            markAgentDead(snakeGame.registry, instance.headId);
            clearSnakeSteeringLeaseFromProp(instance.head);
            if (state.followCamera?.targetProp?.id === instance.headId) state.followCamera.clear();
        },
    };
}
class DynamicSpeciesMap extends Map {
    get(key) {
        if (!super.has(key)) {
            const config = getSnakeGameConfig();
            if (config?.agentProfiles?.[key]) {
                const species = createAgentSpecies(key);
                super.set(key, species);
            }
        }
        return super.get(key);
    }
    has(key) {
        const config = getSnakeGameConfig();
        return super.has(key) || !!config?.agentProfiles?.[key];
    }
    keys() {
        const config = getSnakeGameConfig();
        return new Set([...super.keys(), ...Object.keys(config?.agentProfiles ?? {})]).keys();
    }
}
export const SNAKE_GAME_SPECIES = new DynamicSpeciesMap();
// ==========================================
// Compatibility Wrappers for Tests
// ==========================================
