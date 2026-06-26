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
