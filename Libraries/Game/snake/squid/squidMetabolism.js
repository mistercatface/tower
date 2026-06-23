import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";

export function createSquidMetabolism() {
    return { hunger: 1 };
}

export function getSquidHunger(metabolism) {
    return metabolism.hunger;
}

export function setSquidHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
}

export function feedSquidMetabolism(metabolism, value = getAgentProfile(AGENT_PROFILE.squid).metabolism.foodValue) {
    metabolism.hunger = Math.min(1, metabolism.hunger + (value ?? getAgentProfile(AGENT_PROFILE.squid).metabolism.foodValue));
}

export function tickSquidMetabolism(metabolism, dtMs, drainMultiplier = 1) {
    const { hungerDrainMs } = getAgentProfile(AGENT_PROFILE.squid).metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger < 0) metabolism.hunger = 0;
}
