import { perceiveAgentWorld, perceiveAgentWorldInto, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
import { resolveRelationshipForInstances } from "./agentRelationships.js";
import { getSharedConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
export function resolveAgentPerceptionOptions(state, visionRange = null, agentCtx = null) {
    const shared = getSharedConfig();
    const resolved = visionRange ?? shared.visionRange;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? resolved.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, undefined, distSq),
        committedTargetId: agentCtx?.instance?.intent?.getTargetId() ?? null,
        targetStickyFactor: shared.targetingHysteresis?.targetStickyFactor ?? 0.75,
    };
}
export function perceiveAgentIntentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return perceiveAgentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, resolved, resolveAgentPerceptionOptions(state, resolved, agentCtx));
}
export function perceiveAgentIntentWorld(seeker, agentCtx, state, visibleSourceResolvers, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return perceiveAgentWorld(seeker, agentCtx, state, visibleSourceResolvers, resolved, resolveAgentPerceptionOptions(state, resolved, agentCtx));
}
export function findNearestVisibleThreat(seeker, agentCtx, state, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return findAgentThreat(seeker, agentCtx, state, resolved, resolveAgentPerceptionOptions(state, resolved, agentCtx));
}
