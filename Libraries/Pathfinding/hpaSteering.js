import { computeDirectSteering } from "../Agent/steering.js";
import { computePathSteering } from "./pathFollow.js";

/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */

/**
 * Path-follow steering when a path exists; direct seek otherwise.
 * @param {AgentPose} pose
 * @param {{ x: number, y: number }[] | null} path
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} [settings]
 * @param {NavSessionState | null} [navState]
 * @returns {SteeringResult & { offPath?: boolean }}
 */
export function computeHpaSteering(pose, path, targetX, targetY, settings = {}, navState = null) {
    if (path && path.length >= 2) {
        return computePathSteering(pose, path, targetX, targetY, settings, navState);
    }
    return computeDirectSteering(pose, targetX, targetY);
}
