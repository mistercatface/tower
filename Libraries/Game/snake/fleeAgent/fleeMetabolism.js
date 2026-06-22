import { getSnakeGameConfig } from "../snakeGameConfig.js";

export function createFleeMetabolism() {
    return { hunger: 1 };
}

export function getFleeHunger(metabolism) {
    return metabolism.hunger;
}

export function setFleeHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
}

export function feedFleeMetabolism(metabolism, value = null) {
    const fleeConfig = getSnakeGameConfig().fleeAgent;
    const foodValue = value ?? fleeConfig.metabolism.foodValue;
    metabolism.hunger = Math.min(1, metabolism.hunger + foodValue);
}

export function tickFleeMetabolism(metabolism, dtMs, drainMultiplier = 1) {
    const { hungerDrainMs } = getSnakeGameConfig().fleeAgent.metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger < 0) metabolism.hunger = 0;
}
