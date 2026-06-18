import { createBrain } from "../../AI/brain/createBrain.js";
import { buildNavStepPenaltyFromSpatialMemory } from "../../AI/brain/navStepPenalty.js";
import { collectVisibleGridCells, resolveObserverHeading } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function createSnakeBrain() {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    return {
        brain,
        sync(seeker, state) {
            const { halfAngle, range } = config.visionCone;
            const grid = state.obstacleGrid;
            const heading = resolveObserverHeading(seeker);
            const cells = collectVisibleGridCells(grid, seeker.x, seeker.y, heading, halfAngle, range);
            brain.stampSeenCells(cells);
            seeker.navStepPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: config.navMemoryStepPenalty, falloff: config.navMemoryStepFalloff });
        },
    };
}
