import { agentPose } from "../../Libraries/Agent/index.js";
import { computeDirectSteering } from "../../Libraries/Agent/steering.js";
import { computeHpaNavSteering } from "../../Libraries/Pathfinding/hpaSteering.js";
import { navHasPath } from "../../Libraries/Pathfinding/navSession.js";
function replanPath(entity, targetX, targetY, hpaPathSession, navState, obstacleGrid, graphEpoch, nowMs) {
    hpaPathSession.requestReplan(navState, { obstacleGrid, startX: entity.x, startY: entity.y, targetX, targetY, nowMs, graphEpoch });
}
/**
 * HPA replan policy + pure steering compute. Does not mutate desiredX/Y.
 * @param {{
 *   isVisible?: (entity: object) => boolean,
 * }} hooks
 * @returns {{ steering: import("../../Libraries/Agent/types.js").SteeringResult, mode: string, replanReason: string | null, pathLen: number }}
 */
export function planHpaSteering(entity, targetX, targetY, hpaPathSession, navState, profile, settings, obstacleGrid, obstacleGeneration, hooks = {}, nowMs = Date.now(), hpaPathWorker = null) {
    const isVisible = hooks.isVisible ? hooks.isVisible(entity) : true;
    const obstaclesChanged = navState.obstacleGeneration !== obstacleGeneration;
    const moved = Math.hypot(entity.x - (navState.lastX ?? entity.x), entity.y - (navState.lastY ?? entity.y));
    navState.lastX = entity.x;
    navState.lastY = entity.y;
    if (moved < settings.stuckMoveThreshold) navState.stuckFrames += 1;
    else navState.stuckFrames = 0;
    const now = nowMs;
    let replanReason = null;
    let didReplanForObstacles = false;
    if (obstaclesChanged) {
        navState.obstacleGeneration = obstacleGeneration;
        if (isVisible || navState.stuckFrames > settings.stuckReplanFrames) {
            replanPath(entity, targetX, targetY, hpaPathSession, navState, obstacleGrid, obstacleGeneration, now);
            replanReason = "obstacles";
            navState.stuckFrames = 0;
            didReplanForObstacles = true;
        }
    }
    const needsReplan = !navHasPath(navState) || navState.stuckFrames > settings.stuckReplanFrames;
    if (needsReplan && !didReplanForObstacles && !hpaPathSession.isReplanInFlight(navState)) {
        if (!navHasPath(navState)) replanReason = "noPath";
        else if (navState.stuckFrames > settings.stuckReplanFrames) replanReason = "stuck";
        if (isVisible || navState.stuckFrames > settings.stuckReplanFrames) {
            replanPath(entity, targetX, targetY, hpaPathSession, navState, obstacleGrid, obstacleGeneration, now);
            navState.stuckFrames = 0;
        }
    }
    const pose = agentPose(entity);
    const steerSettings = { ...settings, grid: obstacleGrid };
    let steering = computeHpaNavSteering(pose, navState, targetX, targetY, steerSettings, obstacleGrid, hpaPathWorker);
    if (!steering) steering = computeDirectSteering(pose, targetX, targetY);
    if (navHasPath(navState) && steering.offPath && now - navState.lastOffPathReplan >= 250) {
        replanReason = "offPath";
        navState.lastOffPathReplan = now;
        replanPath(entity, targetX, targetY, hpaPathSession, navState, obstacleGrid, obstacleGeneration, now);
        steering = computeHpaNavSteering(pose, navState, targetX, targetY, steerSettings, obstacleGrid, hpaPathWorker);
        if (!steering) steering = computeDirectSteering(pose, targetX, targetY);
    }
    const hasPath = navHasPath(navState);
    const pathLen = navState.pathLen;
    return { steering, mode: hasPath ? "hpa" : "direct", replanReason, pathLen: hasPath ? pathLen : 0 };
}
