import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function createSnakeBrain({ visionCone: visionConeOverride } = {}) {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, {
        visionCone: visionConeOverride ?? config.visionCone,
        brainSyncOffScreenInterval: config.brainSyncOffScreenInterval,
        navMemoryStepPenalty: config.navMemoryStepPenalty,
        navMemoryStepFalloff: config.navMemoryStepFalloff,
    });
    return { brain, sync };
}
