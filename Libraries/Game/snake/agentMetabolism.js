import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
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
 * Ticks the agent metabolism.
 * Returns true if a starvation shed event occurred.
 */
export function tickAgentMetabolism(metabolism, dtMs, drainMultiplier = 1, onStarveCycle = null) {
    metabolism.hunger -= (dtMs * drainMultiplier) / metabolism.hungerDrainMs;
    if (metabolism.hunger > 0) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.hunger = 0;
    if (metabolism.starveShedIntervalMs !== null && onStarveCycle) {
        metabolism.starveMs += dtMs * drainMultiplier;
        let shed = false;
        while (metabolism.starveMs >= metabolism.starveShedIntervalMs) {
            const didShed = onStarveCycle();
            if (!didShed) {
                metabolism.starveMs = 0;
                break;
            }
            metabolism.starveMs -= metabolism.starveShedIntervalMs;
            shed = true;
        }
        return shed;
    }
    return false;
}
// --- Snake Scaling & Growth Helpers ---
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function getSnakeSegmentCount(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSegmentCount !== undefined && head._cachedSnakeSegmentCountFrame === state.sandbox.frameId && !members) return head._cachedSnakeSegmentCount;
    const count = (members || getConnectedComponentPath(state.kinetic, headId)).length;
    if (head) {
        head._cachedSnakeSegmentCount = count;
        head._cachedSnakeSegmentCountFrame = state.sandbox?.frameId;
    }
    return count;
}
export function getSnakeSizeScore(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSizeScore !== undefined && head._cachedSnakeSizeScoreFrame === state.sandbox?.frameId && !members) return head._cachedSnakeSizeScore;
    const score = getSnakeSegmentCount(state, headId, members) * 1000 + getSnakeChainRadius(state, headId);
    if (head) {
        head._cachedSnakeSizeScore = score;
        head._cachedSnakeSizeScoreFrame = state.sandbox?.frameId;
    }
    return score;
}
export function growSnakeChainAfterMeal(state, headId, profile) {
    const segmentRadius = getSnakeChainRadius(state, headId);
    const spacing = segmentRadius * 2 * (profile.linkSlack ?? 1);
    return { segmentRadius, spacing, linkSlack: profile.linkSlack };
}
