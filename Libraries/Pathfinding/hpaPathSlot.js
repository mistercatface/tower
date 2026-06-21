const PATH_WAYPOINT_ARRIVAL_PX = 16;
function sabWaypointArrived(bodyX, bodyY, worker, slot, i, arrivalPx, grid, navTopology) {
    const wp = sabPathWorldAt(worker, slot, i, grid);
    if (Math.hypot(wp.x - bodyX, wp.y - bodyY) > arrivalPx) return false;
    const from = grid.worldToGrid(bodyX, bodyY);
    const to = grid.worldToGrid(wp.x, wp.y);
    if (from.col === to.col && from.row === to.row) return true;
    if (Math.abs(from.col - to.col) > 1 || Math.abs(from.row - to.row) > 1) return false;
    return grid.canStep(from.col, from.row, to.col, to.row, navTopology);
}
/** @param {import("./HpaPathWorker.js").HpaPathWorker} worker @param {number} slot @param {number} i @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function sabPathWorldAt(worker, slot, i, grid) {
    const col = worker.pathCol(slot, i);
    const row = worker.pathRow(slot, i);
    return grid.gridToWorld(col, row);
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function findSabPathProgressIdx(x, y, worker, slot, pathLen, grid, navTopology) {
    if (pathLen <= 0) return 0;
    const here = grid.worldToGrid(x, y);
    let idx = 0;
    for (let i = 0; i < pathLen; i++) {
        const col = worker.pathCol(slot, i);
        const row = worker.pathRow(slot, i);
        if (col === here.col && row === here.row) idx = i + 1;
    }
    if (idx >= pathLen) idx = pathLen - 1;
    const waypointArrival = PATH_WAYPOINT_ARRIVAL_PX;
    while (idx < pathLen - 1) {
        const wp = sabPathWorldAt(worker, slot, idx, grid);
        if (Math.hypot(wp.x - x, wp.y - y) > waypointArrival) break;
        const from = grid.worldToGrid(x, y);
        const to = grid.worldToGrid(wp.x, wp.y);
        if (from.col === to.col && from.row === to.row) {
            idx++;
            continue;
        }
        if (Math.abs(from.col - to.col) > 1 || Math.abs(from.row - to.row) > 1) break;
        if (!grid.canStep(from.col, from.row, to.col, to.row, navTopology)) break;
        idx++;
    }
    return idx;
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} progressIdx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function buildSabPathOverlayFromProgress(x, y, worker, slot, pathLen, progressIdx, grid) {
    if (pathLen <= 0) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, pathLen - 1));
    const pathNodes = [];
    for (let i = idx; i < pathLen; i++) pathNodes.push(sabPathWorldAt(worker, slot, i, grid));
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const a = grid.worldToGrid(x, y);
        const b = grid.worldToGrid(first.x, first.y);
        if (Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1) pathNodes.unshift({ x, y });
    }
    return { pathNodes };
}
/**
 * Debug overlay — maps abstract idx SAB + graph meta to world nodes. Only call from getPathOverlay.
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {{ pathPlanner: "local" | "hpa", abstractPath: Array<{ x: number, y: number, id?: string }> } | null}
 */
export function buildSabAbstractPathOverlay(worker, slot, pathLen, grid) {
    if (pathLen <= 0) return null;
    const abstractLen = worker.abstractPathLen(slot);
    if (abstractLen <= 0) {
        const start = sabPathWorldAt(worker, slot, 0, grid);
        const target = sabPathWorldAt(worker, slot, pathLen - 1, grid);
        return {
            pathPlanner: "local",
            abstractPath: [
                { x: start.x, y: start.y, id: "start" },
                { x: target.x, y: target.y, id: "target" },
            ],
        };
    }
    const nodeCount = worker.graphNodeCount;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const nodeIds = worker.graphNodeIds;
    const abstractPath = [];
    for (let i = 0; i < abstractLen; i++) {
        const idx = worker.abstractPathIdx(slot, i);
        if (idx === startTemp) {
            const w = sabPathWorldAt(worker, slot, 0, grid);
            abstractPath.push({ x: w.x, y: w.y, id: "start" });
        } else if (idx === targetTemp) {
            const w = sabPathWorldAt(worker, slot, pathLen - 1, grid);
            abstractPath.push({ x: w.x, y: w.y, id: "target" });
        } else abstractPath.push({ ...grid.gridToWorld(worker.graphNodeCol(idx), worker.graphNodeRow(idx)), id: nodeIds[idx] });
    }
    return { pathPlanner: "hpa", abstractPath };
}
/**
 * @param {import("../Agent/types.js").AgentPose} pose
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} targetX
 * @param {number} targetY
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ navCardinalOpen: Uint8Array, vertexPassability: Uint8Array, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, wallRevision: number }} navTopology
 * @param {object} [settings]
 * @param {import("./navSession.js").NavSessionState | null} [navState]
 */
export function computeSabPathSteering(pose, worker, slot, pathLen, targetX, targetY, grid, navTopology, settings, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const waypointArrival = settings.pathWaypointArrival;
    const arrivalDistance = settings.arrivalDistance;
    const offPathDistance = settings.pathOffPathDistance;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= pathLen) step = pathLen - 1;
    let steerTarget = sabPathWorldAt(worker, slot, step, grid);
    let dx = steerTarget.x - x;
    let dy = steerTarget.y - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, worker, slot, step, waypointArrival, grid, navTopology)) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerTarget = sabPathWorldAt(worker, slot, step, grid);
        dx = steerTarget.x - x;
        dy = steerTarget.y - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, offPath: false };
    if (!(dist >= 0.01)) return { desiredX: 0, desiredY: 0, offPath: false };
    return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > offPathDistance };
}
