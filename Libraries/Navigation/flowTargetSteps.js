import { octileDistance } from "../Spatial/grid/GridUtils.js";
function resolveFlowFieldGrid(state) {
    return state.flowFieldGrid ?? state.nav?.flowFieldGrid ?? null;
}
function packReachKey(grid, agentCol, agentRow, targetCol, targetRow) {
    if (agentCol < 0 || agentCol >= grid.cols || agentRow < 0 || agentRow >= grid.rows || targetCol < 0 || targetCol >= grid.cols || targetRow < 0 || targetRow >= grid.rows) return null;
    const cellCount = grid.cols * grid.rows;
    return (agentRow * grid.cols + agentCol) * cellCount + targetRow * grid.cols + targetCol;
}
function readFlowStepsInto(out, flowFieldGrid, agentX, agentY, targetX, targetY, range) {
    if (typeof flowFieldGrid.readFlowStepsForTargetInto === "function") return flowFieldGrid.readFlowStepsForTargetInto(out, agentX, agentY, targetX, targetY, range);
    const result = flowFieldGrid.readFlowStepsForTarget(agentX, agentY, targetX, targetY, range);
    out.slot = result.slot;
    out.steps = result.steps;
    out.ready = result.ready;
    return out;
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
export function readTargetSteps(state, agent, target, mode, committed, routeStatus, staleCache, range, flowResult) {
    if (!target) return null;
    const committedLen = readCommittedPathLen(target, mode, committed, routeStatus);
    if (committedLen !== null) return committedLen;
    const flowFieldGrid = resolveFlowFieldGrid(state);
    const grid = state.obstacleGrid;
    if (!flowFieldGrid || !grid || (typeof flowFieldGrid.readFlowStepsForTargetInto !== "function" && typeof flowFieldGrid.readFlowStepsForTarget !== "function")) {
        if (!grid) return null;
        return octileDistance(grid.worldCol(agent.x), grid.worldRow(agent.y), grid.worldCol(target.x), grid.worldRow(target.y));
    }
    const result = readFlowStepsInto(flowResult, flowFieldGrid, agent.x, agent.y, target.x, target.y, range);
    const agentCol = grid.worldCol(agent.x);
    const agentRow = grid.worldRow(agent.y);
    const navCol = grid.worldCol(target.x);
    const navRow = grid.worldRow(target.y);
    const navCellKey = packReachKey(grid, agentCol, agentRow, navCol, navRow);
    const token = typeof flowFieldGrid.flowReachCacheToken === "function" ? flowFieldGrid.flowReachCacheToken() : "";
    const tick = state.sandbox?.snakeGame?.simTick ?? state.simTick ?? 0;
    if (result.ready) {
        if (result.steps !== null && navCellKey !== null) staleCache.remember(navCellKey, result.steps, tick, token);
        return result.steps;
    }
    const staleSteps = navCellKey === null ? null : staleCache.lookup(navCellKey, tick, token);
    if (staleSteps !== null) return staleSteps;
    return octileDistance(agentCol, agentRow, navCol, navRow);
}
export function createFlowTargetStepSlots(slots) {
    const slotList = [];
    for (const key of Object.keys(slots)) {
        const slot = slots[key];
        slotList.push({ key, targetKey: slot.targetKey, mode: slot.mode });
    }
    return slotList;
}
export function buildFlowTargetStepsInto(out, memoryWorld, committed, routeStatus, slotList, ctx) {
    for (let i = 0; i < slotList.length; i++) {
        const { key, targetKey, mode } = slotList[i];
        const target = memoryWorld[targetKey];
        out[key] = readTargetSteps(ctx.state, ctx.agent, target, mode, committed, routeStatus, ctx.staleCache, ctx.range, ctx.flowResult);
    }
    return out;
}
