import { buildNavStepPenaltyFromSpatialMemory } from "./navStepPenalty.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
export function createSpatialBrainSync(brain, { visionRange, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return function syncSpatialBrain(agent, state) {
        const frame = getObserverVisionFrame(state);
        const vision = frame.ensureHeadVision(agent, visionRange);
        brain.stampSeenCells(vision.cells);
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff });
            lastPenaltyGeneration = generation;
        }
        agent.navStepPenalty = lastPenalty;
    };
}
