import { classifyAgentVision } from "./classifyAgentVision.js";
export function classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, vision, { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship }) {
    return classifyAgentVision(seeker, agentCtx, state, frame, vision, { visionRange, agentRange, resolveRelationship, trackPrey: true });
}
export function findNearestVisibleThreatFromVision(seeker, agentCtx, state, frame, vision, perceptionOptions) {
    return classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, vision, perceptionOptions).threat;
}
export function findNearestVisibleThreat(seeker, agentCtx, state, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const range = agentRange ?? resolved.range;
    return findNearestVisibleThreatFromVision(seeker, agentCtx, state, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship });
}
export function perceiveAgentWorldInto(out, seeker, agentCtx, state, resolveVisibleFood, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const range = agentRange ?? resolved.range;
    const agents = classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship });
    const food = resolveVisibleFood(seeker, state, { frame, visionRange: resolved });
    out.threat = agents.threat;
    out.prey = agents.prey;
    out.ally = agents.ally;
    out.food = food;
    out.allyCount = agents.allyCount;
    out.allyCentroid = agents.allyCentroid;
    out.threatCount = agents.threatCount;
    return out;
}
export function perceiveAgentWorld(seeker, agentCtx, state, resolveVisibleFood, visionRange, perceptionOptions) {
    return perceiveAgentWorldInto(
        { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 },
        seeker,
        agentCtx,
        state,
        resolveVisibleFood,
        visionRange,
        perceptionOptions,
    );
}
