import { navReachStepsTo } from "../../Navigation/navReachHorizon.js";
export function reachStepsForMode(target, mode, committed, routeStatus) {
    if (!target) return null;
    if (committed?.mode === mode && committed.targetId === target.id) {
        if (routeStatus?.destReached) {
            const pathLen = routeStatus?.pathLen;
            return Number.isFinite(pathLen) ? pathLen : 0;
        }
        const pathLen = routeStatus?.pathLen;
        if (routeStatus?.hasRoute && Number.isFinite(pathLen) && pathLen > 0) return pathLen;
    }
    return navReachStepsTo(target.x, target.y);
}
export function buildAgentReachStepsInto(out, memoryWorld, committed, routeStatus, slots) {
    for (const [key, { targetKey, mode }] of Object.entries(slots)) out[key] = reachStepsForMode(memoryWorld[targetKey], mode, committed, routeStatus);
    return out;
}
export function buildAgentReachSteps(memoryWorld, committed, routeStatus, slots) {
    const reachSteps = {};
    return buildAgentReachStepsInto(reachSteps, memoryWorld, committed, routeStatus, slots);
}
