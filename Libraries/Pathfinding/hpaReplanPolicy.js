import { navHasPath } from "./navSession.js";
export const REPLAN_TARGET_MOVE_PX = 64;
export const REPLAN_OFF_PATH_COOLDOWN_MS = 250;
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @returns {{ obstacleGrid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, startX: number, startY: number, targetX: number, targetY: number, nowMs: number, graphEpoch: number }}
 */
export function buildReplanParams(obstacleGrid, startX, startY, targetX, targetY, graphEpoch, nowMs) {
    return { obstacleGrid, startX, startY, targetX, targetY, nowMs, graphEpoch };
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
export function obstacleEpochReplanDue(navState, graphEpoch) {
    return navState.obstacleGeneration < graphEpoch;
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function idlePathReplanReason(navState, settings, didReplanForObstacles, inFlight) {
    if (inFlight || didReplanForObstacles) return null;
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
export function sandboxReplanDue(navState, pendingTargetReplan, inFlight, targetX, targetY) {
    if (inFlight) return false;
    if (pendingTargetReplan) return true;
    if (!navState.pathLen) return true;
    const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
    return targetMovedPx >= REPLAN_TARGET_MOVE_PX;
}
