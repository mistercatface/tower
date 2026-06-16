import { computeDirectSteering } from "../Agent/steering.js";
import { computePathSteering } from "./pathFollow.js";
import { computeSabPathSteering } from "./hpaPathSlot.js";
/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
function navHasActivePath(navState) {
    return navState.pathLen > 0 || !!navState.path?.length;
}
/**
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
    return useSab
        ? computeSabPathSteering(pose, worker, navState.pathSlot, navState.pathLen, targetX, targetY, { ...settings, grid }, navState)
        : computePathSteering(pose, navState.path, targetX, targetY, { ...settings, grid }, navState);
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
