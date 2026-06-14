/** @typedef {import("../Agent/types.js").AgentPose} AgentPose */
/** @typedef {import("../Agent/types.js").SteeringResult} SteeringResult */
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
const PATH_WAYPOINT_ARRIVAL_PX = 24;
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null | undefined} grid */
function pathWaypointArrived(bodyX, bodyY, wpX, wpY, arrivalPx, grid) {
    if (Math.hypot(wpX - bodyX, wpY - bodyY) > arrivalPx) return false;
    if (!grid?.canStep) return true;
    const from = grid.worldToGrid(bodyX, bodyY);
    const to = grid.worldToGrid(wpX, wpY);
    if (from.col === to.col && from.row === to.row) return true;
    if (Math.abs(from.col - to.col) > 1 || Math.abs(from.row - to.row) > 1) return true;
    return grid.canStep(from.col, from.row, to.col, to.row);
}
/**
 * Pick the first path index the entity hasn't reached yet. Does not mutate the path.
 *
 * @param {number} x
 * @param {number} y
 * @param {{ x: number, y: number }[]} path
 * @param {{ worldToGrid?: (wx: number, wy: number) => { col: number, row: number }, grid?: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid }} [options]
 */
export function findPathProgressIdx(x, y, path, options = {}) {
    if (!path?.length) return 0;
    let idx = 0;
    const { worldToGrid, grid } = options;
    if (worldToGrid) {
        const here = worldToGrid(x, y);
        for (let i = 0; i < path.length; i++) {
            const cell = worldToGrid(path[i].x, path[i].y);
            if (cell.col === here.col && cell.row === here.row) idx = i + 1;
        }
    }
    if (idx >= path.length) idx = path.length - 1;
    while (idx < path.length - 1 && pathWaypointArrived(x, y, path[idx].x, path[idx].y, PATH_WAYPOINT_ARRIVAL_PX, grid)) idx++;
    return idx;
}
/** @deprecated Use findPathProgressIdx — kept so callers can migrate without silent breakage. */
export function trimPathAhead(x, y, path, options = {}) {
    if (!path?.length) return path;
    return path.slice(findPathProgressIdx(x, y, path, options));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} ax @param {number} ay @param {number} bx @param {number} by */
function cellsAreGridNeighbors(grid, ax, ay, bx, by) {
    const a = grid.worldToGrid(ax, ay);
    const b = grid.worldToGrid(bx, by);
    return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}
/**
 * @param {number} x
 * @param {number} y
 * @param {{ x: number, y: number }[] | null | undefined} path
 * @param {number} progressIdx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null | undefined} grid
 */
export function buildPathOverlayFromProgress(x, y, path, progressIdx, grid = null) {
    if (!path?.length) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, path.length - 1));
    const pathNodes = path.slice(idx);
    const first = pathNodes[0];
    if (grid && first && Math.hypot(first.x - x, first.y - y) > 1 && cellsAreGridNeighbors(grid, x, y, first.x, first.y) && pathWaypointArrived(x, y, first.x, first.y, PATH_WAYPOINT_ARRIVAL_PX, grid))
        pathNodes.unshift({ x, y });
    return { pathNodes };
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
    const waypointArrival = settings.pathWaypointArrival ?? 24;
    const arrivalDistance = settings.arrivalDistance ?? 2;
    const offPathDistance = settings.pathOffPathDistance ?? 64;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= path.length) step = path.length - 1;
    let steerTarget = path[step];
    let dx = steerTarget.x - x;
    let dy = steerTarget.y - y;
    let dist = Math.hypot(dx, dy);
    const grid = settings.grid ?? null;
    while (dist < waypointArrival && step < path.length - 1 && pathWaypointArrived(x, y, path[step].x, path[step].y, waypointArrival, grid)) {
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
