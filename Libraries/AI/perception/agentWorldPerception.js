import { classifyAgentVision, classifyAgentVisionInto } from "./classifyAgentVision.js";
export function resolveVisibleCategoryInVision(state, seeker, categoryIndex, accept, options = {}) {
    const frame = state.nav.observerVisionFrame;
    const instance = state.sandbox.snakeGame?.instancesByHeadId?.get(seeker.id) ?? null;
    const visionRange = options.visionRange ?? seeker.visionRange ?? instance?.visionRange ?? frame.visionRange;
    const resolvedVision = frame.ensureHeadVision(seeker, visionRange);
    const rangeSq = visionRange.range * visionRange.range;
    const cols = frame.navTopology.grid.cols;
    const committedTargetId = options.committedTargetId ?? null;
    const targetStickyFactor = options.targetStickyFactor ?? 1.0;
    let best = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < resolvedVision.cells.length; i++) {
        const idx = resolvedVision.cells[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        if (categoryIndex.countAtCell(col, row) === 0) continue;
        const prop = categoryIndex.nearestItemInCell(col, row, seeker.x, seeker.y, accept, seeker);
        if (!prop) continue;
        const dx = prop.x - seeker.x;
        const dy = prop.y - seeker.y;
        const d = dx * dx + dy * dy;
        if (d > rangeSq) continue;
        let compareDistSq = d;
        if (committedTargetId !== null && prop.id === committedTargetId) compareDistSq *= targetStickyFactor;
        if (compareDistSq >= bestDistSq) continue;
        bestDistSq = compareDistSq;
        best = prop;
    }
    return best;
}
export function classifyVisibleAgentsFromVision(state, seeker, options) {
    return classifyAgentVision(state, seeker, options);
}
export function findNearestVisibleThreatFromVision(state, seeker, options) {
    return classifyAgentVision(state, seeker, options).threat;
}
export function findNearestVisibleThreat(state, seeker, options) {
    return classifyAgentVision(state, seeker, options).threat;
}
export function perceiveAgentWorldInto(out, state, seeker, visibleSourceResolvers, options) {
    classifyAgentVisionInto(out, state, seeker, options);
    if (visibleSourceResolvers) for (const slotId in visibleSourceResolvers) out[slotId] = visibleSourceResolvers[slotId](state, seeker, options) ?? null;
    else out.food = null;
    return out;
}
export function perceiveAgentWorld(state, seeker, visibleSourceResolvers, options) {
    return perceiveAgentWorldInto({ threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 }, state, seeker, visibleSourceResolvers, options);
}
