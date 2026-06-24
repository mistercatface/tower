import { perceiveAgentWorld, perceiveAgentWorldInto, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { getSharedConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
export function resolveAgentPerceptionOptions(state, visionRange = null) {
    const shared = getSharedConfig();
    const resolved = visionRange ?? shared.visionRange;
    const snakeGame = state.sandbox?.snakeGame;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? resolved.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => (snakeGame ? resolveAgentRelationship(snakeGame, selfInstance, targetInstance, distSq) : "neutral"),
    };
}
export function perceiveAgentIntentWorldInto(out, seeker, agentCtx, state, resolveVisibleFood, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return perceiveAgentWorldInto(out, seeker, agentCtx, state, resolveVisibleFood, resolved, resolveAgentPerceptionOptions(state, resolved));
}
export function perceiveAgentIntentWorld(seeker, agentCtx, state, resolveVisibleFood, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return perceiveAgentWorld(seeker, agentCtx, state, resolveVisibleFood, resolved, resolveAgentPerceptionOptions(state, resolved));
}
export function findNearestVisibleThreat(seeker, agentCtx, state, visionRange = null) {
    const resolved = visionRange ?? getSharedConfig().visionRange;
    return findAgentThreat(seeker, agentCtx, state, resolved, resolveAgentPerceptionOptions(state, resolved));
}
