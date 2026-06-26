import { perceiveAgentWorld, perceiveAgentWorldInto, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
import { resolveRelationshipForInstances } from "./agentRelationships.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
export function resolveAgentPerceptionOptions(visionRange, shared, agentCtx) {
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? visionRange.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, distSq),
        committedTargetId: agentCtx?.instance?.intent?.getTargetId() ?? null,
        targetStickyFactor: shared.targetingHysteresis?.targetStickyFactor ?? 0.75,
    };
}
export function perceiveAgentIntentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, visionRange, shared) {
    return perceiveAgentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, visionRange, resolveAgentPerceptionOptions(visionRange, shared, agentCtx));
}
export function perceiveAgentIntentWorld(seeker, agentCtx, state, visibleSourceResolvers, visionRange, shared) {
    return perceiveAgentWorld(seeker, agentCtx, state, visibleSourceResolvers, visionRange, resolveAgentPerceptionOptions(visionRange, shared, agentCtx));
}
export function findNearestVisibleThreat(seeker, agentCtx, state, visionRange, shared) {
    return findAgentThreat(seeker, agentCtx, state, visionRange, resolveAgentPerceptionOptions(visionRange, shared, agentCtx));
}
