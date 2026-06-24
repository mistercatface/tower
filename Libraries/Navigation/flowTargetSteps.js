import { octileDistance } from "../Spatial/grid/GridUtils.js";

function resolveFlowFieldGrid(state) {
    return state.flowFieldGrid ?? state.nav?.flowFieldGrid ?? null;
}

export function readCommittedPathLen(target, mode, committed, routeStatus) {
    if (!target) return null;
    if (committed?.mode === mode && committed.targetId === target.id) {
        if (routeStatus?.destReached) {
            const pathLen = routeStatus?.pathLen;
            return Number.isFinite(pathLen) ? pathLen : 0;
        }
        const pathLen = routeStatus?.pathLen;
        if (routeStatus?.hasRoute && Number.isFinite(pathLen) && pathLen > 0) return pathLen;
    }
    return null;
}

export function readTargetSteps({ state, agent, target, mode, committed, routeStatus, staleCache, range }) {
    if (!target) return null;
    
    const committedLen = readCommittedPathLen(target, mode, committed, routeStatus);
    if (committedLen !== null) return committedLen;

    const flowFieldGrid = resolveFlowFieldGrid(state);
    const grid = state.obstacleGrid;

    if (!flowFieldGrid || !grid || typeof flowFieldGrid.readFlowStepsForTarget !== "function") {
        if (!grid) return null;
        return octileDistance(grid.worldCol(agent.x), grid.worldRow(agent.y), grid.worldCol(target.x), grid.worldRow(target.y));
    }

    const recenterThreshold = state.nav?.settings?.recenterThreshold ?? 16;
    flowFieldGrid.ensureRollTargetWindow(agent.x, agent.y, target.x, target.y, recenterThreshold);

    const result = flowFieldGrid.readFlowStepsForTarget(agent.x, agent.y, target.x, target.y, range);
    
    const navCol = grid.worldCol(target.x);
    const navRow = grid.worldRow(target.y);
    const navCellKey = `${navCol},${navRow}`;
    const tick = state.sandbox?.snakeGame?.simTick ?? state.simTick ?? 0;

    if (result.ready) {
        if (result.steps !== null) {
            staleCache.remember(navCellKey, result.steps, tick);
        }
        return result.steps;
    }

    const staleSteps = staleCache.lookup(navCellKey, tick);
    if (staleSteps !== null) return staleSteps;

    return octileDistance(grid.worldCol(agent.x), grid.worldRow(agent.y), navCol, navRow);
}

export function buildFlowTargetStepsInto(out, memoryWorld, committed, routeStatus, slots, ctx) {
    for (const [key, { targetKey, mode }] of Object.entries(slots)) {
        const target = memoryWorld[targetKey];
        out[key] = readTargetSteps({ ...ctx, target, mode, committed, routeStatus });
    }
    return out;
}
