import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { resolveAgentRelationship } from "../snakeAgentSession.js";
import { requireSnakeVisionFrame } from "../snakePerception.js";
import { perceiveAgentWorld } from "../../../AI/perception/agentWorldPerception.js";
export function resolveFleeAgentPerceptionOptions(state, visionRange = null) {
    const config = getSnakeGameConfig();
    const resolved = visionRange ?? config.visionRange;
    const snakeGame = state.sandbox?.snakeGame;
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? resolved.range,
        resolveRelationship: (selfHeadId, headId, gameState) => (snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, gameState) : "neutral"),
    };
}
export function perceiveFleeAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, perceptionOptions) {
    const config = getSnakeGameConfig();
    const resolved = visionRange ?? config.visionRange;
    return perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, resolved, perceptionOptions ?? resolveFleeAgentPerceptionOptions(state, resolved));
}
