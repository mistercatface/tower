import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { perceiveAgentWorld, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
export function resolveSnakeAgentPerceptionOptions(state, visionRange = null) {
    const config = getSnakeGameConfig();
    const resolved = visionRange ?? config.visionRange;
    const snakeGame = state.sandbox?.snakeGame;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? resolved.range,
        resolveRelationship: (selfHeadId, headId, state) => (snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, state) : "neutral"),
    };
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange) {
    const config = getSnakeGameConfig();
    const resolved = visionRange ?? config.visionRange;
    return perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, resolved, resolveSnakeAgentPerceptionOptions(state, resolved));
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionRange) {
    const config = getSnakeGameConfig();
    const resolved = visionRange ?? config.visionRange;
    return findAgentThreat(seeker, selfHeadId, state, registry, resolved, resolveSnakeAgentPerceptionOptions(state, resolved));
}
