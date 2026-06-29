import { getCirclePropRadius } from "../../Props/propScale.js";
// --- Unified Agent Metabolism ---
/**
 * Creates a unified metabolism state object for any agent.
 * Pre-caches relevant configuration values from the profile at instantiation time.
 */
export class AgentMetabolism {
    constructor(profile) {
        this.hungerDrainMs = profile.metabolism?.hungerDrainMs ?? 30_000;
        this.foodValue = profile.metabolism?.foodValue ?? 0.5;
        this.growthCost = profile.metabolism?.growthCost ?? null;
        this.starveShedIntervalMs = profile.metabolism?.starveShedIntervalMs ?? null;
        this.hunger = profile.initialHunger ?? 1.0;
        this.growth = 0;
        this.starveMs = 0;
    }
    getHunger() {
        return this.hunger;
    }
    setHunger(fraction) {
        this.hunger = Math.max(0, Math.min(1, fraction));
        this.starveMs = 0;
    }
    feed(value = null) {
        const foodAmount = value ?? this.foodValue;
        this.starveMs = 0;
        this.hunger += foodAmount;
        let growCount = 0;
        if (this.hunger > 1.0) {
            const excess = this.hunger - 1.0;
            this.hunger = 1.0;
            if (this.growthCost !== null) {
                this.growth += excess;
                while (this.growth >= this.growthCost) {
                    this.growth -= this.growthCost;
                    growCount++;
                }
            }
        }
        return growCount;
    }
    advanceHunger(dtMs, drainMultiplier = 1) {
        this.hunger -= (dtMs * drainMultiplier) / this.hungerDrainMs;
        if (this.hunger > 0) {
            this.starveMs = 0;
            return false;
        }
        this.hunger = 0;
        if (this.starveShedIntervalMs !== null) this.starveMs += dtMs * drainMultiplier;
        return true;
    }
}
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
