import { computeSabPathSteering } from "./hpaPathSlot.js";
import { navHasPath } from "./navSession.js";
/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
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
    if (!worker || !navHasPath(navState)) return null;
    return computeSabPathSteering(pose, worker, navState.pathSlot, navState.pathLen, targetX, targetY, { ...settings, grid }, navState);
}
