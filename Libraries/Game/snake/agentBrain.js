import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { getSharedConfig } from "./snakeGameConfig.js";
export function createAgentBrain(visionRangeOverride) {
    const shared = getSharedConfig();
    const brain = createBrain({ spatialMemoryCapacity: shared.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, {
        visionRange: visionRangeOverride ?? shared.visionRange,
        navMemoryStepPenalty: shared.navMemoryStepPenalty,
        navMemoryStepFalloff: shared.navMemoryStepFalloff,
    });
    return { brain, sync };
}
/** @deprecated use createAgentBrain */
export const createSnakeBrain = createAgentBrain;
