import {
    AgentMetabolism,
    Brain,
    AgentAutosim,
    buildNavStepPenaltyFromSpatialMemory,
    applyAgentGameplay,
    resolveRelationshipForInstances,
    bakeRelationshipRules,
    resolveAgentTeamForIndex,
    resolveAgentTeamForFaction,
    applySnakeChainTint,
    copySnakeChainTintFromHead
} from "../../Libraries/Game/snake/AgentInstance.js";
import { TargetMemory, targetFromMemoryRecord, RangedCombatActionState, AgentIntentMemory, ModePolicyLatch, resolveRangedWeapon } from "../../Libraries/Game/snake/GroundNavIntentAdapter.js";
import { isBallCombatTopology, isChainCombatTopology, shouldSkipPreyHeadRamKill, COMBAT_TRAIT_DEFAULTS } from "../../Libraries/Game/snake/snakeCombat.js";
import { AgentFrameOrchestrator, createAgentSpecies, SNAKE_GAME_SPECIES, SnakeAgentSession } from "../../Libraries/Game/snake/snakeAgentSession.js";
import { getCirclePropRadius } from "../../Libraries/Props/propScale.js";
import { deriveSprintIntentInto } from "../../Libraries/AI/agents/AgentDecisionContext.js";

// Re-export targetFromMemoryRecord for tests that need it
export {
    createAgentSpecies,
    SNAKE_GAME_SPECIES,
    targetFromMemoryRecord,
    buildNavStepPenaltyFromSpatialMemory,
    resolveRangedWeapon,
    applyAgentGameplay,
    resolveRelationshipForInstances,
    bakeRelationshipRules,
    resolveAgentTeamForIndex,
    resolveAgentTeamForFaction,
    applySnakeChainTint,
    copySnakeChainTintFromHead,
    isBallCombatTopology,
    isChainCombatTopology,
    shouldSkipPreyHeadRamKill,
    COMBAT_TRAIT_DEFAULTS
};

export function syncBallAgentFacingAfterPhysics(instance, dtMs) {
    if (instance && typeof instance.syncBallAgentFacingAfterPhysics === "function") {
        instance.syncBallAgentFacingAfterPhysics(dtMs);
    }
}

// --- Agent Metabolism Legacy Wrappers ---
export function createAgentMetabolism(profile) {
    return new AgentMetabolism(profile);
}

export function getAgentHunger(metabolism) {
    return metabolism.getHunger();
}

export function setAgentHunger(metabolism, fraction) {
    metabolism.setHunger(fraction);
}

export function feedAgentMetabolism(metabolism, value = null) {
    return metabolism.feed(value);
}

export function advanceAgentMetabolismHunger(metabolism, dtMs, drainMultiplier = 1) {
    return metabolism.advanceHunger(dtMs, drainMultiplier);
}

// --- Target Memory Legacy Wrappers ---
export function createTargetMemory(kinds, ttlByKind) {
    return new TargetMemory(kinds, ttlByKind);
}

// --- Ranged Combat Legacy Wrappers ---
export function createRangedCombatActionState() {
    return new RangedCombatActionState();
}

export function resetRangedCombatAction(action) {
    if (action) action.reset();
}

export function rangedCombatActionOnCooldown(action) {
    if (!action) return false;
    return typeof action.isOnCooldown === "function" ? action.isOnCooldown() : (action.phase === "fire_delay" || action.phase === "reloading");
}

export function rangedCombatActionIsBusy(action) {
    if (!action) return false;
    return typeof action.isBusy === "function" ? action.isBusy() : (action.phase === "reacting" || action.phase === "fire_delay" || action.phase === "reloading");
}

export function createBrain(config) {
    return new Brain(config);
}

export function createAgentAutosim(state, instance) {
    return new AgentAutosim(state, instance);
}

export function createAgentIntentMemory(config) {
    return new AgentIntentMemory(config);
}

export function createModePolicyLatch(config) {
    return new ModePolicyLatch(config);
}

export function createAgentFrameOrchestrator(config) {
    return new AgentFrameOrchestrator(config);
}

// --- Local Implementations for Deprecated Helpers ---
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}

export function growSnakeChainAfterMeal(state, headId, profile) {
    const segmentRadius = getSnakeChainRadius(state, headId);
    const spacing = segmentRadius * 2 * (profile.linkSlack ?? 1);
    return { segmentRadius, spacing, linkSlack: profile.linkSlack };
}

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

export function deriveSprintIntent(mode, ctx, sprintConfig) {
    const out = { want: false, reason: "none" };
    return deriveSprintIntentInto(out, mode, ctx, sprintConfig);
}
