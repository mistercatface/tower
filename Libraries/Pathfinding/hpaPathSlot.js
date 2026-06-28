const PATH_WAYPOINT_ARRIVAL_PX = 16;
function sabWaypointArrived(bodyX, bodyY, worker, slot, i, arrivalPx, grid, navTopology) {
    const idx = worker.pathIdx(slot, i);
    const wx = grid.gridCenterXByIdx(idx);
    const wy = grid.gridCenterYByIdx(idx);
    if (Math.hypot(wx - bodyX, wy - bodyY) > arrivalPx) return false;
    const fromCol = grid.worldCol(bodyX);
    const fromRow = grid.worldRow(bodyY);
    const toCol = grid.worldCol(wx);
    const toRow = grid.worldRow(wy);
    if (fromCol === toCol && fromRow === toRow) return true;
    if (Math.abs(fromCol - toCol) > 1 || Math.abs(fromRow - toRow) > 1) return false;
    return grid.canStep(fromCol, fromRow, toCol, toRow, navTopology);
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
    const hereCol = grid.worldCol(x);
    const hereRow = grid.worldRow(y);
    let idx = 0;
    for (let i = 0; i < pathLen; i++) {
        const cellIdx = worker.pathIdx(slot, i);
        const col = cellIdx % grid.cols;
        const row = (cellIdx / grid.cols) | 0;
        if (col === hereCol && row === hereRow) idx = i + 1;
    }
    if (idx >= pathLen) idx = pathLen - 1;
    const waypointArrival = PATH_WAYPOINT_ARRIVAL_PX;
    while (idx < pathLen - 1) {
        const cellIdx = worker.pathIdx(slot, idx);
        const wx = grid.gridCenterXByIdx(cellIdx);
        const wy = grid.gridCenterYByIdx(cellIdx);
        if (Math.hypot(wx - x, wy - y) > waypointArrival) break;
        const fromCol = grid.worldCol(x);
        const fromRow = grid.worldRow(y);
        const toCol = grid.worldCol(wx);
        const toRow = grid.worldRow(wy);
        if (fromCol === toCol && fromRow === toRow) {
            idx++;
            continue;
        }
        if (Math.abs(fromCol - toCol) > 1 || Math.abs(fromRow - toRow) > 1) break;
        if (!grid.canStep(fromCol, fromRow, toCol, toRow, navTopology)) break;
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
    for (let i = idx; i < pathLen; i++) {
        const cellIdx = worker.pathIdx(slot, i);
        pathNodes.push({ x: grid.gridCenterXByIdx(cellIdx), y: grid.gridCenterYByIdx(cellIdx) });
    }
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const aCol = grid.worldCol(x);
        const aRow = grid.worldRow(y);
        const bCol = grid.worldCol(first.x);
        const bRow = grid.worldRow(first.y);
        if (Math.abs(aCol - bCol) <= 1 && Math.abs(aRow - bRow) <= 1) pathNodes.unshift({ x, y });
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
export function buildSabAbstractPathOverlay(worker, slot, pathLen) {
    if (pathLen <= 0) return null;
    const abstractLen = worker.abstractPathLen(slot);
    if (abstractLen <= 0) {
        return {
            pathPlanner: "local",
            abstractPath: [worker.pathIdx(slot, 0), worker.pathIdx(slot, pathLen - 1)],
        };
    }
    const nodeCount = worker.graphNodeCount;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const abstractPath = [];
    for (let i = 0; i < abstractLen; i++) {
        const idx = worker.abstractPathIdx(slot, i);
        if (idx === startTemp) {
            abstractPath.push(worker.pathIdx(slot, 0));
        } else if (idx === targetTemp) {
            abstractPath.push(worker.pathIdx(slot, pathLen - 1));
        } else {
            abstractPath.push(worker.graphNodeIdx(idx));
        }
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
    let steerIdx = worker.pathIdx(slot, step);
    let steerX = grid.gridCenterXByIdx(steerIdx);
    let steerY = grid.gridCenterYByIdx(steerIdx);
    let dx = steerX - x;
    let dy = steerY - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, worker, slot, step, waypointArrival, grid, navTopology)) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerIdx = worker.pathIdx(slot, step);
        steerX = grid.gridCenterXByIdx(steerIdx);
        steerY = grid.gridCenterYByIdx(steerIdx);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, offPath: false };
    if (!(dist >= 0.01)) return { desiredX: 0, desiredY: 0, offPath: false };
    return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > offPathDistance };
}
