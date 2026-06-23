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
    const range = agentRange ?? resolved.range;
    return findNearestVisibleThreatFromVision(seeker, selfHeadId, state, registry, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship });
}

export function perceiveAgentWorldInto(out, seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const range = agentRange ?? resolved.range;
    const agents = classifyVisibleAgentsFromVision(seeker, selfHeadId, state, registry, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship });
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

export function perceiveAgentWorld(seeker, selfHeadId, state, registry, resolveVisibleFood, visionRange, perceptionOptions) {
    return perceiveAgentWorldInto(
        { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 },
        seeker,
        selfHeadId,
        state,
        registry,
        resolveVisibleFood,
        visionRange,
        perceptionOptions,
    );
}
