import { AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { createAgentAutosim } from "./agentAutosim.js";
export { createAgentBrain, createSnakeBrain } from "./agentBrain.js";
export { runAgentFsmTick, runAgentFsmTick as runSnakeFsmTick } from "./agentAutosim.js";
export function createSnakeAutosim(state, options) {
    return createAgentAutosim(state, {
        profileId: AGENT_PROFILE.snake,
        leaderId: options.headId,
        navWalkable: options.navWalkable,
        rng: options.rng,
        visionRange: options.visionRange,
        initialFoodFraction: options.initialFoodFraction,
        eatRadius: options.eatRadius,
        ballType: options.ballType,
        growDirX: options.growDirX,
        growDirY: options.growDirY,
    });
}
