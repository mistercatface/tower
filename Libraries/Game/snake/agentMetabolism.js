import { getCirclePropRadius } from "../../Props/propScale.js";
// --- Unified Agent Metabolism ---
/**
 * Creates a unified metabolism state object for any agent.
 * Pre-caches relevant configuration values from the profile at instantiation time.
 */
export function createAgentMetabolism(profile) {
    const hungerDrainMs = profile.metabolism?.hungerDrainMs ?? 30_000;
    const foodValue = profile.metabolism?.foodValue ?? 0.5;
    const growthCost = profile.metabolism?.growthCost ?? null;
    const starveShedIntervalMs = profile.metabolism?.starveShedIntervalMs ?? null;
    return { hunger: profile.initialHunger ?? 1.0, growth: 0, starveMs: 0, hungerDrainMs, foodValue, growthCost, starveShedIntervalMs };
}
export function getAgentHunger(metabolism) {
    return metabolism.hunger;
}
export function setAgentHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
    metabolism.starveMs = 0;
}
/**
 * Feeds the agent metabolism.
 * Returns the number of segments to grow (if any).
 */
export function feedAgentMetabolism(metabolism, value = null) {
    const foodAmount = value ?? metabolism.foodValue;
    metabolism.starveMs = 0;
    metabolism.hunger += foodAmount;
    let growCount = 0;
    if (metabolism.hunger > 1.0) {
        const excess = metabolism.hunger - 1.0;
        metabolism.hunger = 1.0;
        if (metabolism.growthCost !== null) {
            metabolism.growth += excess;
            while (metabolism.growth >= metabolism.growthCost) {
                metabolism.growth -= metabolism.growthCost;
                growCount++;
            }
        }
    }
    return growCount;
}
/**
 * Drains hunger for one tick. Returns true when hunger has hit zero (starving).
 */
export function advanceAgentMetabolismHunger(metabolism, dtMs, drainMultiplier = 1) {
    metabolism.hunger -= (dtMs * drainMultiplier) / metabolism.hungerDrainMs;
    if (metabolism.hunger > 0) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.hunger = 0;
    if (metabolism.starveShedIntervalMs !== null) metabolism.starveMs += dtMs * drainMultiplier;
    return true;
}
// --- Snake Scaling & Growth Helpers ---
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function growSnakeChainAfterMeal(state, headId, profile) {
    const segmentRadius = getSnakeChainRadius(state, headId);
    const spacing = segmentRadius * 2 * (profile.linkSlack ?? 1);
    return { segmentRadius, spacing, linkSlack: profile.linkSlack };
}
