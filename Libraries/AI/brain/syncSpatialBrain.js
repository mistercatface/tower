import { buildNavStepPenaltyFromSpatialMemory } from "./navStepPenalty.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
export function createSpatialBrainSync(brain, { visionCone, brainSyncOffScreenInterval, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return function syncSpatialBrain(agent, state) {
        agent._brainSyncTick = (agent._brainSyncTick ?? 0) + 1;
        const frame = getObserverVisionFrame(state);
        const viewSync = frame.viewSyncFor(agent);
        if (viewSync.onScreen || agent._brainSyncTick % viewSync.brainSyncOffScreenInterval === 0) {
            const vision = frame.ensureHeadVision(agent, visionCone);
            brain.stampSeenCells(vision.cells);
        }
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff });
            lastPenaltyGeneration = generation;
        }
        agent.navStepPenalty = lastPenalty;
    };
}
