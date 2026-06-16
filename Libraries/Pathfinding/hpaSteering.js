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
