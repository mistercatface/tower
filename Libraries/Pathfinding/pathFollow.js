/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
import { projectOntoPath } from "../Spatial/geometry/PathGeometry.js";
export function trimPathAhead(x, y, path) {
    if (!path || path.length === 0) return path;
    if (path.length === 1) return [{ x, y }, path[0]];
    const proj = projectOntoPath(x, y, path);
    let startIdx = proj.segmentIdx + 1;
    if (proj.t > 0.95) startIdx = proj.segmentIdx + 2;
    const trimmed = [{ x, y }];
    for (let i = startIdx; i < path.length; i++) trimmed.push(path[i]);
    if (trimmed.length < 2) trimmed.push(path[path.length - 1]);
    return trimmed;
}
/** @param {number} x @param {number} y @param {number} radius @param {{ x: number, y: number }[] | null | undefined} path @param {number} progressIdx @param {number} targetX @param {number} targetY */
export function buildPathOverlayFromProgress(x, y, radius, path, progressIdx, targetX, targetY) {
    const pad = (radius ?? 6) + 4;
    if (!path?.length) return { fromX: x, fromY: y, waypoints: [{ x: targetX, y: targetY }] };
    let idx = Math.max(0, Math.min(progressIdx ?? 0, path.length - 1));
    while (idx < path.length - 1) {
        const wp = path[idx];
        if (Math.hypot(wp.x - x, wp.y - y) > pad) break;
        idx++;
    }
    const remaining = path.slice(idx);
    const last = remaining[remaining.length - 1];
    if (!last || Math.hypot(last.x - targetX, last.y - targetY) > 1) remaining.push({ x: targetX, y: targetY });
    if (remaining.length === 0) return { fromX: x, fromY: y, waypoints: [{ x: targetX, y: targetY }] };
    const first = remaining[0];
    const dx = first.x - x;
    const dy = first.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist <= pad + 0.5) {
        const tail = remaining.slice(1);
        if (tail.length === 0) return { fromX: x, fromY: y, waypoints: [{ x: targetX, y: targetY }] };
        return { fromX: first.x, fromY: first.y, waypoints: tail };
    }
    return { fromX: x + (dx / dist) * pad, fromY: y + (dy / dist) * pad, waypoints: remaining };
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
    if (step >= path.length - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, offPath: false };
    if (dist < 0.01) return { desiredX: 0, desiredY: 0, offPath: false };
    const offPath = dist > offPathDistance;
    return { desiredX: dx / dist, desiredY: dy / dist, offPath };
}
