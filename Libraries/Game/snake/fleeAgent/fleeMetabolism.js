import { AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { createSimpleAgentMetabolism, feedSimpleAgentMetabolism, getSimpleAgentHunger, setSimpleAgentHunger, tickSimpleAgentMetabolism } from "../agentMetabolism.js";
export const createFleeMetabolism = createSimpleAgentMetabolism;
export const getFleeHunger = getSimpleAgentHunger;
export const setFleeHunger = setSimpleAgentHunger;
export function feedFleeMetabolism(metabolism, value) {
    feedSimpleAgentMetabolism(metabolism, AGENT_PROFILE.flee, value);
}
export function tickFleeMetabolism(metabolism, dtMs, drainMultiplier = 1) {
    tickSimpleAgentMetabolism(metabolism, AGENT_PROFILE.flee, dtMs, drainMultiplier);
}
