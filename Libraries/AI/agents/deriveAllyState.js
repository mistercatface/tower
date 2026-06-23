import { isAgentEngaged, readAgentEngagement } from "./agentEngagement.js";
export function deriveAllyState(visibleWorld, known, memorySource = null, session = null, allyReachSteps = null) {
    const visibleAlly = memorySource?.ally ? null : (visibleWorld?.ally ?? null);
    const knownAlly = known?.ally ?? null;
    const engagement = knownAlly && session ? readAgentEngagement(session, knownAlly.id) : null;
    const leadworthy = knownAlly ? (session ? isAgentEngaged(session, knownAlly.id) : true) : false;
    return {
        ally: knownAlly,
        dist: allyReachSteps ?? null,
        count: known?.allyCount ?? 0,
        centroid: visibleAlly ? (visibleWorld.allyCentroid ?? null) : null,
        visible: !!visibleAlly,
        remembered: !!memorySource?.ally && !!knownAlly,
        engagement,
        leadworthy,
    };
}
