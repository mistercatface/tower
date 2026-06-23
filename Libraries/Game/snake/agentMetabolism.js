import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
export function createSimpleAgentMetabolism() {
    return { hunger: 1 };
}
export function getSimpleAgentHunger(metabolism) {
    return metabolism.hunger;
}
export function setSimpleAgentHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
}
export function feedSimpleAgentMetabolism(metabolism, profileId, value = null) {
    const profile = getAgentProfile(profileId);
    const foodValue = value ?? profile.metabolism?.foodValue ?? 0.5;
    metabolism.hunger = Math.min(1, metabolism.hunger + foodValue);
}
export function tickSimpleAgentMetabolism(metabolism, profileId, dtMs, drainMultiplier = 1) {
    const { hungerDrainMs } = getAgentProfile(profileId).metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger < 0) metabolism.hunger = 0;
}
