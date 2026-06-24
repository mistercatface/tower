import { classifyAgentVision } from "./classifyAgentVision.js";
import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";

export function resolveVisibleCategoryInVision(categoryIndex, seeker, frame, visionRange, accept) {
    const vision = frame.ensureHeadVision(seeker, visionRange);
    const nav = frame.navTopology,
        grid = nav.grid;
    const originCol = grid.worldCol(seeker.x),
        originRow = grid.worldRow(seeker.y);
    const rangeSq = visionRange.range * visionRange.range;
    let best = null,
        bestDistSq = Infinity;
    for (const { col, row } of vision.cells) {
        if (categoryIndex.countAtCell(col, row) === 0) continue;
        const prop = categoryIndex.nearestItemInCell(col, row, seeker.x, seeker.y, (p) => accept(seeker, p));
        if (!prop) continue;
        const dx = prop.x - seeker.x,
            dy = prop.y - seeker.y,
            d = dx * dx + dy * dy;
        if (d > rangeSq || d >= bestDistSq) continue;
        if (!hasGridCellLineOfSightCached(frame.visionSession, nav, originCol, originRow, col, row)) continue;
        bestDistSq = d;
        best = prop;
    }
    return best;
}

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
export function perceiveAgentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, visionRange, { readVisionFrame, agentRange, resolveRelationship }) {
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const range = agentRange ?? resolved.range;
    const agents = classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship });
    out.threat = agents.threat;
    out.prey = agents.prey;
    out.ally = agents.ally;
    out.allyCount = agents.allyCount;
    out.allyCentroid = agents.allyCentroid;
    out.threatCount = agents.threatCount;

    // Resolve prop categories
    if (visibleSourceResolvers) for (const slotId in visibleSourceResolvers) out[slotId] = visibleSourceResolvers[slotId](seeker, state, { frame, visionRange: resolved });
    else out.food = null; // fallback

    return out;
}
export function perceiveAgentWorld(seeker, agentCtx, state, visibleSourceResolvers, visionRange, perceptionOptions) {
    return perceiveAgentWorldInto(
        { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 },
        seeker,
        agentCtx,
        state,
        visibleSourceResolvers,
        visionRange,
        perceptionOptions,
    );
}
