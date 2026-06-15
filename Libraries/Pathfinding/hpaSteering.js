import { computeDirectSteering } from "../Agent/steering.js";
import { computePathSteering } from "./pathFollow.js";

/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */

/** @param {NavSessionState} navState @param {number | null | undefined} hopIdx */
function clampHopProgress(navState, hopIdx) {
    if (hopIdx != null && navState.pathProgressIdx > hopIdx) navState.pathProgressIdx = hopIdx;
}

/**
 * Path-follow steering with boundary-hop mouth clamping.
 * @param {AgentPose} pose
 * @param {NavSessionState} navState
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} settings
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {(SteeringResult & { offPath?: boolean }) | null}
 */
export function computeHpaNavSteering(pose, navState, targetX, targetY, settings, grid) {
    const path = navState.path;
    if (!path?.length) return null;
    const hopIdx = navState.boundaryHopIdx;
    clampHopProgress(navState, hopIdx);
    if (hopIdx != null && navState.pathProgressIdx === hopIdx && hopIdx < path.length - 1) {
        const next = path[hopIdx + 1];
        const dx = next.x - pose.x;
        const dy = next.y - pose.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > (settings.pathOffPathDistance ?? 64) };
    }
    const result = computePathSteering(pose, path, targetX, targetY, { ...settings, grid }, navState);
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
 * @returns {SteeringResult & { offPath?: boolean }}
 */
export function computeHpaSteering(pose, path, targetX, targetY, settings = {}, navState = null) {
    if (path && path.length >= 2 && navState) return computeHpaNavSteering(pose, navState, targetX, targetY, settings, settings.grid);
    if (path && path.length >= 2) return computePathSteering(pose, path, targetX, targetY, settings, navState);
    return computeDirectSteering(pose, targetX, targetY);
}
