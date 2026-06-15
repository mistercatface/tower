import { computeDirectSteering } from "../Agent/steering.js";
import { computePathSteering } from "./pathFollow.js";
import { computeSabPathSteering } from "./hpaPathSlot.js";
/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @param {NavSessionState} navState @param {number | null | undefined} hopIdx */
function clampHopProgress(navState, hopIdx) {
    if (hopIdx != null && navState.pathProgressIdx > hopIdx) navState.pathProgressIdx = hopIdx;
}
function navHasActivePath(navState) {
    return navState.pathLen > 0 || !!navState.path?.length;
}
/**
 * Path-follow steering with boundary-hop mouth clamping.
 * @param {AgentPose} pose
 * @param {NavSessionState} navState
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} settings
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {HpaPathWorker | null} [worker]
 * @returns {(SteeringResult & { offPath?: boolean }) | null}
 */
export function computeHpaNavSteering(pose, navState, targetX, targetY, settings, grid, worker = null) {
    if (!navHasActivePath(navState)) return null;
    const useSab = worker && navState.pathSlot >= 0 && navState.pathLen > 0;
    const hopIdx = navState.boundaryHopIdx;
    const pathTail = useSab ? navState.pathLen - 1 : (navState.path?.length ?? 0) - 1;
    clampHopProgress(navState, hopIdx);
    if (!useSab && hopIdx != null && navState.pathProgressIdx === hopIdx && hopIdx < pathTail) {
        const next = navState.path[hopIdx + 1];
        const dx = next.x - pose.x;
        const dy = next.y - pose.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > (settings.pathOffPathDistance ?? 64) };
    }
    const result = useSab
        ? computeSabPathSteering(pose, worker, navState.pathSlot, navState.pathLen, targetX, targetY, { ...settings, grid }, navState)
        : computePathSteering(pose, navState.path, targetX, targetY, { ...settings, grid }, navState);
    clampHopProgress(navState, hopIdx);
    return result;
}
/**
 * @param {AgentPose} pose
 * @param {{ x: number, y: number }[] | null} path
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} [settings]
 * @param {NavSessionState | null} [navState]
 * @param {HpaPathWorker | null} [worker]
 * @returns {SteeringResult & { offPath?: boolean }}
 */
export function computeHpaSteering(pose, path, targetX, targetY, settings = {}, navState = null, worker = null) {
    if (navState && navHasActivePath(navState)) return computeHpaNavSteering(pose, navState, targetX, targetY, settings, settings.grid, worker);
    if (path && path.length >= 2) return computePathSteering(pose, path, targetX, targetY, settings, navState);
    return computeDirectSteering(pose, targetX, targetY);
}
