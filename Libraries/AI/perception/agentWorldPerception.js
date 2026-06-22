import { classifyAgentVision } from "./classifyAgentVision.js";
export function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone = frame.visionCone, agentRange = visionCone.range, resolveRelationship }) {
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone, agentRange, resolveRelationship, trackPrey: true });
}
export function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const range = agentRange ?? cone.range;
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
}
export function perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionCone, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const cone = visionCone ?? frame.visionCone;
    const vision = frame.readHeadVision(seeker, cone);
    const range = agentRange ?? cone.range;
    const visionContext = { frame, vision, visionCone: cone };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionCone: cone, agentRange: range, resolveRelationship });
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
