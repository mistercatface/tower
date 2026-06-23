import { isAgentEngaged, readAgentEngagement } from "./agentEngagement.js";
export function deriveAllyStateInto(out, visibleWorld, known, memorySource = null, session = null, allyReachSteps = null) {
    const visibleAlly = memorySource?.ally ? null : visibleWorld?.ally;
    const knownAlly = known?.ally ?? null;
    out.ally = knownAlly;
    out.dist = allyReachSteps ?? null;
    out.count = known?.allyCount ?? 0;
    out.centroid = visibleAlly ? (visibleWorld.allyCentroid ?? null) : null;
    out.visible = !!visibleAlly;
    out.remembered = !!memorySource?.ally && !!knownAlly;
    out.engagement = knownAlly && session ? readAgentEngagement(session, knownAlly.id) : null;
    out.leadworthy = !!knownAlly && (!session || isAgentEngaged(session, knownAlly.id));
    return out;
}
export function deriveAllyState(visibleWorld, known, memorySource = null, session = null, allyReachSteps = null) {
    return deriveAllyStateInto(
        { ally: null, dist: null, count: 0, centroid: null, visible: false, remembered: false, engagement: null, leadworthy: false },
        visibleWorld,
        known,
        memorySource,
        session,
        allyReachSteps,
    );
}
