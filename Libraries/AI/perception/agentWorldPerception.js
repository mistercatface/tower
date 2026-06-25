import { classifyAgentVision } from "./classifyAgentVision.js";
import { hasGridCellLineOfSight } from "../../Navigation/perception/gridCellVision.js";
export function resolveVisibleCategoryInVision(categoryIndex, seeker, frame, visionRange, accept, committedTargetId = null, targetStickyFactor = 1.0) {
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
        if (d > rangeSq) continue;
        let compareDistSq = d;
        if (committedTargetId !== null && prop.id === committedTargetId) compareDistSq *= targetStickyFactor;
        if (compareDistSq >= bestDistSq) continue;
        if (!hasGridCellLineOfSight(nav, originCol, originRow, col, row)) continue;
        bestDistSq = compareDistSq;
        best = prop;
    }
    return best;
}
export function classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, vision, options) {
    const { visionRange = frame.visionRange, agentRange = visionRange.range, resolveRelationship, committedTargetId = null, targetStickyFactor = 1.0 } = options;
    return classifyAgentVision(seeker, agentCtx, state, frame, vision, { visionRange, agentRange, resolveRelationship, trackPrey: true, committedTargetId, targetStickyFactor });
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
export function perceiveAgentWorldInto(out, seeker, agentCtx, state, visibleSourceResolvers, visionRange, options) {
    const { readVisionFrame, agentRange, resolveRelationship, committedTargetId = null, targetStickyFactor = 1.0 } = options;
    const frame = readVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const range = agentRange ?? resolved.range;
    const agents = classifyVisibleAgentsFromVision(seeker, agentCtx, state, frame, null, { visionRange: resolved, agentRange: range, resolveRelationship, committedTargetId, targetStickyFactor });
    out.threat = agents.threat;
    out.prey = agents.prey;
    out.ally = agents.ally;
    out.allyCount = agents.allyCount;
    out.allyCentroid = agents.allyCentroid;
    out.threatCount = agents.threatCount;
    if (visibleSourceResolvers)
        for (const slotId in visibleSourceResolvers) out[slotId] = visibleSourceResolvers[slotId](seeker, state, { frame, visionRange: resolved, committedTargetId, targetStickyFactor }) ?? null;
    else out.food = null;
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
