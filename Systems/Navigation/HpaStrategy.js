import { agentPose } from "../../Libraries/Agent/index.js";
import { computeDirectSteering } from "../../Libraries/Agent/steering.js";
import { computeSabPathSteering } from "../../Libraries/Pathfinding/hpaPathSlot.js";
import { trackNavStuck, obstacleReplanAllowed, idlePathReplanReason, idlePathReplanAllowed, offPathReplanDue, buildReplanParams } from "../../Libraries/Pathfinding/hpaReplanPolicy.js";
import { navHasPath } from "../../Libraries/Pathfinding/navSession.js";
/**
 * HPA replan policy + pure steering compute. Does not mutate desiredX/Y.
 * @param {{
 *   isVisible?: (entity: object) => boolean,
 * }} hooks
 * @returns {{ steering: import("../../Libraries/Agent/types.js").SteeringResult, mode: string, replanReason: string | null, pathLen: number }}
 */
export function planHpaSteering(entity, targetX, targetY, hpaPathSession, navState, profile, settings, obstacleGrid, obstacleGeneration, hooks = {}, nowMs = Date.now(), hpaPathWorker = null) {
    const isVisible = hooks.isVisible ? hooks.isVisible(entity) : true;
    trackNavStuck(navState, entity.x, entity.y, settings.stuckMoveThreshold);
    const now = nowMs;
    let replanReason = null;
    let didReplanForObstacles = false;
    const replanParams = buildReplanParams(obstacleGrid, entity.x, entity.y, targetX, targetY, obstacleGeneration, now);
    const requestReplan = () => hpaPathSession.requestReplan(navState, replanParams);
    const obstaclesChanged = navState.obstacleGeneration !== obstacleGeneration;
    if (obstaclesChanged) {
        navState.obstacleGeneration = obstacleGeneration;
        if (obstacleReplanAllowed(isVisible, navState.stuckFrames, settings.stuckReplanFrames)) {
            requestReplan();
            replanReason = "obstacles";
            navState.stuckFrames = 0;
            didReplanForObstacles = true;
        }
    }
    const idleReason = idlePathReplanReason(navState, settings, didReplanForObstacles, hpaPathSession.isReplanInFlight(navState));
    if (idlePathReplanAllowed(navState, idleReason, isVisible, settings.stuckReplanFrames)) {
        replanReason = idleReason;
        requestReplan();
        navState.stuckFrames = 0;
    }
    const pose = agentPose(entity);
    let steering = hpaPathWorker && navHasPath(navState) ? computeSabPathSteering(pose, hpaPathWorker, navState.pathSlot, navState.pathLen, targetX, targetY, obstacleGrid, settings, navState) : null;
    if (!steering) steering = computeDirectSteering(pose, targetX, targetY);
    if (offPathReplanDue(steering, navState, now)) {
        replanReason = "offPath";
        navState.lastOffPathReplan = now;
        requestReplan();
        steering = hpaPathWorker && navHasPath(navState) ? computeSabPathSteering(pose, hpaPathWorker, navState.pathSlot, navState.pathLen, targetX, targetY, obstacleGrid, settings, navState) : null;
        if (!steering) steering = computeDirectSteering(pose, targetX, targetY);
    }
    const hasPath = navHasPath(navState);
    const pathLen = navState.pathLen;
    return { steering, mode: hasPath ? "hpa" : "direct", replanReason, pathLen: hasPath ? pathLen : 0 };
}
