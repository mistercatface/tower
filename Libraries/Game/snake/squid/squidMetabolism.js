import { AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { createSimpleAgentMetabolism, feedSimpleAgentMetabolism, getSimpleAgentHunger, setSimpleAgentHunger, tickSimpleAgentMetabolism } from "../agentMetabolism.js";
export const createSquidMetabolism = createSimpleAgentMetabolism;
export const getSquidHunger = getSimpleAgentHunger;
export const setSquidHunger = setSimpleAgentHunger;
export function feedSquidMetabolism(metabolism, value) {
    feedSimpleAgentMetabolism(metabolism, AGENT_PROFILE.squid, value);
}
export function tickSquidMetabolism(metabolism, dtMs, drainMultiplier = 1) {
    tickSimpleAgentMetabolism(metabolism, AGENT_PROFILE.squid, dtMs, drainMultiplier);
}
