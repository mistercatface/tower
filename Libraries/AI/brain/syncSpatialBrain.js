import { buildNavStepPenaltyFromSpatialMemory } from "./navStepPenalty.js";
import { resolveObserverGridVision } from "../../Navigation/perception/gridCellVision.js";
import { ensureSnakePerceptionTick } from "../../Game/snake/snakePerception.js";
export function createSpatialBrainSync(brain, { visionCone, brainSyncOffScreenInterval, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return function syncSpatialBrain(seeker, state) {
        const onScreen = state.viewport?.circleInBounds?.(seeker.x, seeker.y, (seeker.radius ?? 8) * 2, "props") ?? true;
        seeker._brainSyncTick = (seeker._brainSyncTick ?? 0) + 1;
        if (onScreen || seeker._brainSyncTick % brainSyncOffScreenInterval === 0) {
            ensureSnakePerceptionTick(state);
            const vision = resolveObserverGridVision(seeker, state.navigation.gridNavContext, visionCone, state.navigation.gridCellVisionSession, { onScreen, brainSyncOffScreenInterval });
            brain.stampSeenCells(vision.cells);
        }
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff });
            lastPenaltyGeneration = generation;
        }
        seeker.navStepPenalty = lastPenalty;
    };
}
