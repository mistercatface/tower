import { AgentMetabolism, Brain, AgentAutosim, buildNavStepPenaltyFromSpatialMemory, getSnakeChainRadius, growSnakeChainAfterMeal } from "../../Libraries/Game/snake/AgentInstance.js";
import { TargetMemory, targetFromMemoryRecord, RangedCombatActionState, AgentIntentMemory, ModePolicyLatch, resolveRangedWeapon } from "../../Libraries/Game/snake/GroundNavIntentAdapter.js";

// Re-export targetFromMemoryRecord for tests that need it
export { targetFromMemoryRecord, buildNavStepPenaltyFromSpatialMemory, resolveRangedWeapon, getSnakeChainRadius, growSnakeChainAfterMeal };

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
