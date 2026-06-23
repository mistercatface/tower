import { AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { createAgentAutosim } from "../agentAutosim.js";
export function createSquidAutosim(state, { brainId, navWalkable, eatRadius, rng, visionRange, initialFoodFraction }) {
    return createAgentAutosim(state, { profileId: AGENT_PROFILE.squid, leaderId: brainId, navWalkable, eatRadius, rng, visionRange, initialFoodFraction });
}
