import { navHasPath } from "./navSession.js";
import { HpaReplanRequest } from "./hpaPathRequest.js";
export const REPLAN_TARGET_MOVE_PX = 64;
export const REPLAN_OFF_PATH_COOLDOWN_MS = 250;
export const REPLAN_PRIORITY_TARGET = 4;
export const REPLAN_PRIORITY_VISIBLE = 3;
export const REPLAN_PRIORITY_NORMAL = 2;
export const REPLAN_PRIORITY_STUCK_OFFSCREEN = 1;
export const HPA_REPLAN_FRAME_START_BUDGET = 12;
export const HPA_REPLAN_PEAK_INFLIGHT_CAP = 16;
export function buildReplanParams(obstacleGrid, startX, startY, targetX, targetY, nav, stepPenalty) {
    return new HpaReplanRequest({
        obstacleGrid,
        startX,
        startY,
        targetX,
        targetY,
        graphEpoch: nav.graphSyncGeneration,
        topologyKey: nav.syncedTopologyKey(),
        navTopology: nav.topology,
        stepPenalty: stepPenalty ?? null,
    });
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function trackNavStuck(navState, x, y, stuckMoveThreshold) {
    const moved = Math.hypot(x - (navState.lastX ?? x), y - (navState.lastY ?? y));
    navState.lastX = x;
    navState.lastY = y;
    if (moved < stuckMoveThreshold) navState.stuckFrames += 1;
    else navState.stuckFrames = 0;
}
export function obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames) {
    return isVisible || stuckFrames > stuckReplanFrames;
}
/** @param {import("./navSession.js").NavSessionState} navState @param {string} currentTopologyKey */
export function obstacleEpochReplanDue(navState, currentTopologyKey) {
    return navState.topologyKey !== currentTopologyKey;
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function idlePathReplanReason(navState, settings, inFlight) {
    if (inFlight) return null;
    if (!navHasPath(navState)) return "noPath";
    if (navState.stuckFrames > settings.stuckReplanFrames) return "stuck";
    return null;
}
export function idlePathReplanAllowed(navState, reason, isVisible, stuckReplanFrames) {
    return reason !== null && (isVisible || navState.stuckFrames > stuckReplanFrames);
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function offPathReplanDue(steering, navState, nowMs, cooldownMs = REPLAN_OFF_PATH_COOLDOWN_MS) {
    return navHasPath(navState) && steering.offPath && nowMs - navState.lastOffPathReplan >= cooldownMs;
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY) {
    if (inFlight) return null;
    if (pendingTargetReplan) return "targetChange";
    if (!navState.pathLen) return "noPath";
    const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
    if (targetMovedPx >= REPLAN_TARGET_MOVE_PX) return "targetMoved";
    return null;
}
export function sandboxReplanAllowed(reason, isVisible, stuckFrames, stuckReplanFrames) {
    if (reason === "targetChange") return true;
    if (reason === "noPath") return isVisible || stuckFrames > stuckReplanFrames;
    if (reason === "targetMoved") return obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames);
    return false;
}
export function replanPriorityFor(reason, isVisible) {
    if (reason === "targetChange") return REPLAN_PRIORITY_TARGET;
    if (!isVisible) return REPLAN_PRIORITY_STUCK_OFFSCREEN;
    if (reason === "noPath" || reason === "stuck" || reason === "offPath") return REPLAN_PRIORITY_VISIBLE;
    return REPLAN_PRIORITY_NORMAL;
}
