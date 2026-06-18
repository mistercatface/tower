import { createBrain } from "../../AI/brain/createBrain.js";
import { buildNavStepPenaltyFromSpatialMemory } from "../../AI/brain/navStepPenalty.js";
import { collectVisibleGridCells, resolveObserverHeading } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function createSnakeBrain({ visionCone: visionConeOverride } = {}) {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return {
        brain,
        sync(seeker, state) {
            const visionCone = visionConeOverride ?? config.visionCone;
            const grid = state.obstacleGrid;
            const onScreen = state.viewport?.isVisible?.(seeker.x, seeker.y, (seeker.radius ?? 8) * 2) ?? true;
            const tick = (seeker._brainSyncTick = (seeker._brainSyncTick ?? 0) + 1);
            if (onScreen || tick % config.brainSyncOffScreenInterval === 0) {
                const heading = resolveObserverHeading(seeker);
                const cells = collectVisibleGridCells(grid, seeker.x, seeker.y, heading, visionCone.halfAngle, visionCone.range);
                brain.stampSeenCells(cells);
            }
            const generation = brain.spatial.generation;
            if (generation !== lastPenaltyGeneration) {
                lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: config.navMemoryStepPenalty, falloff: config.navMemoryStepFalloff });
                lastPenaltyGeneration = generation;
            }
            seeker.navStepPenalty = lastPenalty;
        },
    };
}
