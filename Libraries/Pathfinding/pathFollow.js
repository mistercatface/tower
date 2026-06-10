/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */

export function trimPathAhead(x, y, path) {
    return path;
}

/**
 * @param {AgentPose} pose
 * @param {{ x: number, y: number }[]} path
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} [settings]
 * @param {NavSessionState | null} [navState]
 * @returns {SteeringResult & { offPath: boolean }}
 */
export function computePathSteering(pose, path, targetX, targetY, settings = {}, navState = null) {
    const x = pose.x;
    const y = pose.y;
    // BOIDS uses 0.6 cells squared = 0.77 cells. In pixels (32px/cell), that's ~24px.
    const waypointArrival = settings.pathWaypointArrival ?? 24;
    const arrivalDistance = settings.arrivalDistance ?? 2;
    // BOIDS drops the path if distance > 4.0 grid units (64 pixels)
    const offPathDistance = settings.pathOffPathDistance ?? 64;

    let step = navState?.pathProgressIdx ?? 0;
    if (step >= path.length) step = path.length - 1;

    let steerTarget = path[step];
    let dx = steerTarget.x - x;
    let dy = steerTarget.y - y;
    let dist = Math.hypot(dx, dy);

    // Advance to next waypoint if close enough
    while (dist < waypointArrival && step < path.length - 1) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerTarget = path[step];
        dx = steerTarget.x - x;
        dy = steerTarget.y - y;
        dist = Math.hypot(dx, dy);
    }

    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (distToTarget <= arrivalDistance) {
        return { desiredX: 0, desiredY: 0, offPath: false };
    }

    if (dist < 0.01) {
        return { desiredX: 0, desiredY: 0, offPath: false };
    }

    const offPath = dist > offPathDistance;
    return { desiredX: dx / dist, desiredY: dy / dist, offPath };
}
