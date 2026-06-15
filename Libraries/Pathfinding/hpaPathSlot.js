import { boundaryHopMouthOnSabPath, boundaryHopOnSabCellStep } from "./boundaryNavHops.js";
const PATH_WAYPOINT_ARRIVAL_PX = 24;
/** @param {import("./HpaPathWorker.js").HpaPathWorker} worker @param {number} slot @param {number} i */
function sabPathCell(worker, slot, i) {
    return { col: worker.pathCol(slot, i), row: worker.pathRow(slot, i) };
}
/** @param {import("./HpaPathWorker.js").HpaPathWorker} worker @param {number} slot @param {number} stepIdx @param {number} pathLen @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function sabPathHasBoundaryHopAfter(worker, slot, stepIdx, pathLen, grid) {
    if (stepIdx < 0 || stepIdx >= pathLen - 1) return false;
    return !!boundaryHopOnSabCellStep(sabPathCell(worker, slot, stepIdx), sabPathCell(worker, slot, stepIdx + 1), grid);
}
function sabWaypointArrived(bodyX, bodyY, worker, slot, i, arrivalPx, grid) {
    const wp = sabPathWorldAt(worker, slot, i, grid);
    if (Math.hypot(wp.x - bodyX, wp.y - bodyY) > arrivalPx) return false;
    const from = grid.worldToGrid(bodyX, bodyY);
    const to = grid.worldToGrid(wp.x, wp.y);
    if (from.col === to.col && from.row === to.row) return true;
    if (Math.abs(from.col - to.col) > 1 || Math.abs(from.row - to.row) > 1) return false;
    return grid.canStep(from.col, from.row, to.col, to.row);
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
export function findSabPathProgressIdx(x, y, worker, slot, pathLen, grid) {
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
        if (sabPathHasBoundaryHopAfter(worker, slot, idx, pathLen, grid)) break;
        const wp = sabPathWorldAt(worker, slot, idx, grid);
        if (Math.hypot(wp.x - x, wp.y - y) > waypointArrival) break;
        const from = grid.worldToGrid(x, y);
        const to = grid.worldToGrid(wp.x, wp.y);
        if (from.col === to.col && from.row === to.row) {
            idx++;
            continue;
        }
        if (Math.abs(from.col - to.col) > 1 || Math.abs(from.row - to.row) > 1) break;
        if (!grid.canStep(from.col, from.row, to.col, to.row)) break;
        idx++;
    }
    const hopIdx = boundaryHopIdxOnSabPath(worker, slot, pathLen, grid);
    if (hopIdx != null && idx > hopIdx) return hopIdx;
    return idx;
}
/** @param {import("./HpaPathWorker.js").HpaPathWorker} worker @param {number} slot @param {number} pathLen @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function boundaryHopIdxOnSabPath(worker, slot, pathLen, grid) {
    const readCell = (i) => sabPathCell(worker, slot, i);
    const mouth = boundaryHopMouthOnSabPath(readCell, pathLen, grid);
    if (!mouth) return null;
    for (let i = 0; i < pathLen; i++) if (readCell(i).col === mouth.col && readCell(i).row === mouth.row) return i;
    for (let i = 1; i < pathLen; i++) {
        const hop = boundaryHopOnSabCellStep(readCell(i - 1), readCell(i), grid);
        if (hop) return i - 1;
    }
    return null;
}
/** @param {number | null | undefined} boundaryHopIdx @param {number} progressIdx */
export function sabPathOverlayEndExclusive(pathLen, boundaryHopIdx, progressIdx) {
    if (boundaryHopIdx == null || progressIdx > boundaryHopIdx) return pathLen;
    return Math.min(pathLen, boundaryHopIdx + 1);
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} progressIdx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number | null} [boundaryHopIdx]
 */
export function buildSabPathOverlayFromProgress(x, y, worker, slot, pathLen, progressIdx, grid, boundaryHopIdx = null) {
    if (pathLen <= 0) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, pathLen - 1));
    const endExclusive = sabPathOverlayEndExclusive(pathLen, boundaryHopIdx, idx);
    const pathNodes = [];
    for (let i = idx; i < endExclusive; i++) pathNodes.push(sabPathWorldAt(worker, slot, i, grid));
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const a = grid.worldToGrid(x, y);
        const b = grid.worldToGrid(first.x, first.y);
        if (Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1) pathNodes.unshift({ x, y });
    }
    return { pathNodes };
}
/**
 * @param {import("../Agent/types.js").AgentPose} pose
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} settings
 * @param {import("./navSession.js").NavSessionState | null} navState
 */
export function computeSabPathSteering(pose, worker, slot, pathLen, targetX, targetY, settings = {}, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const grid = settings.grid;
    const waypointArrival = settings.pathWaypointArrival ?? PATH_WAYPOINT_ARRIVAL_PX;
    const arrivalDistance = settings.arrivalDistance ?? 2;
    const offPathDistance = settings.pathOffPathDistance ?? 64;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= pathLen) step = pathLen - 1;
    let steerTarget = sabPathWorldAt(worker, slot, step, grid);
    let dx = steerTarget.x - x;
    let dy = steerTarget.y - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, worker, slot, step, waypointArrival, grid)) {
        if (sabPathHasBoundaryHopAfter(worker, slot, step, pathLen, grid)) break;
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerTarget = sabPathWorldAt(worker, slot, step, grid);
        dx = steerTarget.x - x;
        dy = steerTarget.y - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, offPath: false };
    if (dist < 0.01) return { desiredX: 0, desiredY: 0, offPath: false };
    return { desiredX: dx / dist, desiredY: dy / dist, offPath: dist > offPathDistance };
}
