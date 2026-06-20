import { buildNavStepPenaltyFromSpatialMemory } from "./navStepPenalty.js";
import { ensureObserverGridVision, resolveObserverViewSyncContext } from "../../Navigation/perception/gridCellVision.js";
export function createSpatialBrainSync(brain, { visionCone, brainSyncOffScreenInterval, navMemoryStepPenalty, navMemoryStepFalloff, ensurePerceptionTick, resolvePerceptionTick = null }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    return function syncSpatialBrain(agent, state) {
        const viewSync = resolveObserverViewSyncContext(state.viewport, agent, brainSyncOffScreenInterval);
        agent._brainSyncTick = (agent._brainSyncTick ?? 0) + 1;
        if (viewSync.onScreen || agent._brainSyncTick % viewSync.brainSyncOffScreenInterval === 0) {
            ensurePerceptionTick(state);
            const perceptionTick = resolvePerceptionTick ? resolvePerceptionTick(state) : null;
            const vision = ensureObserverGridVision(agent, state.navigation.gridNavContext, visionCone, state.navigation.gridCellVisionSession, {
                ...viewSync,
                perceptionTick,
                brainSyncTick: agent._brainSyncTick,
            });
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
