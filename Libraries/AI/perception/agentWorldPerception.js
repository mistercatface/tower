import { classifyAgentVision } from "./classifyAgentVision.js";
export function classifyVisibleAgentsFromVision(
    seeker,
    selfHeadId,
    state,
    registry,
    frame,
    vision,
    { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship, isAllyFollowable = null },
) {
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange, agentRange, resolveRelationship, trackPrey: true, isAllyFollowable });
}
export function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionRange, { readVisionFrame, agentRange, resolveRelationship, isAllyFollowable = null }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    const range = agentRange ?? resolved.range;
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange: resolved, agentRange: range, resolveRelationship, isAllyFollowable });
}
export function perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, { readVisionFrame, agentRange, resolveRelationship, isAllyFollowable = null }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    const range = agentRange ?? resolved.range;
    const visionContext = { frame, vision, visionRange: resolved };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange: resolved, agentRange: range, resolveRelationship, isAllyFollowable });
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
