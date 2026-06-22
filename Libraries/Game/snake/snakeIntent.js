import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { perceiveAgentWorld, findNearestVisibleThreat as findAgentThreat } from "../../AI/perception/agentWorldPerception.js";
export function resolveSnakeAgentPerceptionOptions(state, visionCone = null) {
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    const snakeGame = state.sandbox?.snakeGame;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? cone.range,
        resolveRelationship: (selfHeadId, headId, state) => (snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, state) : "neutral"),
    };
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    return perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, cone, resolveSnakeAgentPerceptionOptions(state, cone));
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone) {
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    return findAgentThreat(seeker, selfHeadId, state, registry, cone, resolveSnakeAgentPerceptionOptions(state, cone));
}
