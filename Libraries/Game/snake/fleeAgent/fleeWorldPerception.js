import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { resolveAgentRelationship } from "../snakeAgentSession.js";
import { requireSnakeVisionFrame } from "../snakePerception.js";
import { classifyAgentVision } from "../../../AI/perception/classifyAgentVision.js";
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
export function classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship }) {
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange, agentRange, resolveRelationship, trackPrey: true });
}
export function perceiveFleeAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    const config = getSnakeGameConfig();
    const range = agentRange ?? config.fleeRange ?? resolved.range;
    const visionContext = { frame, vision, visionRange: resolved };
    const agents = classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange: resolved, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { ...agents, food, foodDist };
}
