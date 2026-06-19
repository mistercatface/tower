import { buildNavStepPenaltyFromSpatialMemory } from "./navStepPenalty.js";
import { collectVisibleGridCells, resolveObserverHeading } from "../../Navigation/perception/gridCellVision.js";
export function createSpatialBrainSync(brain, { visionCone, brainSyncOffScreenInterval, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return function syncSpatialBrain(seeker, state) {
        const grid = state.obstacleGrid;
        const onScreen = state.viewport?.isVisible?.(seeker.x, seeker.y, (seeker.radius ?? 8) * 2) ?? true;
        const tick = (seeker._brainSyncTick = (seeker._brainSyncTick ?? 0) + 1);
        if (onScreen || tick % brainSyncOffScreenInterval === 0) {
            const heading = resolveObserverHeading(seeker);
            const cells = collectVisibleGridCells(grid, seeker.x, seeker.y, heading, visionCone.halfAngle, visionCone.range);
            brain.stampSeenCells(cells);
        }
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff });
            lastPenaltyGeneration = generation;
        }
        seeker.navStepPenalty = lastPenalty;
    };
}
