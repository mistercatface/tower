import { perceiveAgentWorld, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { getSharedConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
export function resolveAgentPerceptionOptions(state, visionRange = null) {
    const shared = getSharedConfig();
    const resolved = visionRange ?? shared.visionRange;
    const snakeGame = state.sandbox?.snakeGame;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? resolved.range,
        resolveRelationship: (selfHeadId, headId, gameState) => (snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, gameState) : "neutral"),
    };
}
export function perceiveAgentIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, resolved, resolveAgentPerceptionOptions(state, resolved));
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return findAgentThreat(seeker, selfHeadId, state, registry, resolved, resolveAgentPerceptionOptions(state, resolved));
}
