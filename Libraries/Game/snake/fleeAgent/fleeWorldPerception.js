import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { classifyAgentVision } from "../../../AI/perception/classifyAgentVision.js";
export function classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone = frame.visionCone, agentRange = visionCone.range, resolveRelationship }) {
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone, agentRange, resolveRelationship, trackPrey: false });
}
export function perceiveFleeAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const config = getSnakeGameConfig();
    const range = agentRange ?? config.fleeRange ?? cone.range;
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyFleeVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, visionContext);
    const foodDist = food ? Math.hypot(food.x - seeker.x, food.y - seeker.y) / frame.navTopology.grid.cellSize : null;
    return { ...agents, food, foodDist };
}
