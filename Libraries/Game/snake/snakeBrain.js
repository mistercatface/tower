import { createBrain } from "../../AI/brain/createBrain.js";
import { collectVisibleGridCells, resolveObserverHeading } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function createSnakeBrain() {
    const config = getSnakeGameConfig();
    const brain = createBrain({ spatialMemoryCapacity: config.spatialMemoryCapacity });
    return {
        brain,
        syncVision(seeker, state) {
            const { halfAngle, range } = config.visionCone;
            const grid = state.obstacleGrid;
            const heading = resolveObserverHeading(seeker);
            const cells = collectVisibleGridCells(grid, seeker.x, seeker.y, heading, halfAngle, range);
            brain.stampSeenCells(cells);
        },
    };
}
