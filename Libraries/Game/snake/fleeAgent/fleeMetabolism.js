import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
export function createFleeMetabolism() {
    return { hunger: 1 };
}
export function getFleeHunger(metabolism) {
    return metabolism.hunger;
}
export function setFleeHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
}
export function feedFleeMetabolism(metabolism, value = getAgentProfile(AGENT_PROFILE.flee).metabolism.foodValue) {
    metabolism.hunger = Math.min(1, metabolism.hunger + value);
}
export function tickFleeMetabolism(metabolism, dtMs, drainMultiplier = 1) {
    const { hungerDrainMs } = getAgentProfile(AGENT_PROFILE.flee).metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger < 0) metabolism.hunger = 0;
}
