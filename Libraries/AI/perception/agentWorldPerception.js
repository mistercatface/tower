import { classifyAgentVision } from "./classifyAgentVision.js";
export function classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship }) {
    return classifyAgentVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange, agentRange, resolveRelationship, trackPrey: true });
}
export function findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions) {
    return classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, perceptionOptions).threat;
}
export function findNearestVisibleThreat(seeker, selfHeadId, state, registry, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    const range = agentRange ?? resolved.range;
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange: resolved, agentRange: range, resolveRelationship });
}
export function perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    const range = agentRange ?? resolved.range;
    const visionContext = { frame, vision, visionRange: resolved };
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, vision, { visionRange: resolved, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, visionContext);
    return { threat: agents.threat, prey: agents.prey, ally: agents.ally, food, allyCount: agents.allyCount, allyCentroid: agents.allyCentroid, threatCount: agents.threatCount };
}
