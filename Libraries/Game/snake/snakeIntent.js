import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { classifyAgentVision } from "../../AI/perception/classifyAgentVision.js";
function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    const config = getSnakeGameConfig();
    const agentRange = config.fleeRange ?? visionCone.range;
    const snakeGame = state.sandbox?.snakeGame;
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, {
        visionCone,
        agentRange,
        trackPrey: true,
        resolveRelationship: (selfHeadId, headId, state) => (snakeGame ? resolveAgentRelationship(snakeGame, selfHeadId, headId, state) : "neutral"),
    });
}
function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone = frame.visionCone) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, visionCone).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone) {
    const frame = requireSnakeVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
}
export function perceiveSnakeIntentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone) {
    const frame = requireSnakeVisionFrame(state);
    const config = getSnakeGameConfig();
    const cone = visionCone ?? config.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, cone);
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return {
        threat: agents.threat,
        prey: agents.prey,
        ally: agents.ally,
        food,
        threatDist: agents.threatDist,
        preyDist: agents.preyDist,
        allyDist: agents.allyDist,
        foodDist,
        allyCount: agents.allyCount,
        allyCentroid: agents.allyCentroid,
    };
}
