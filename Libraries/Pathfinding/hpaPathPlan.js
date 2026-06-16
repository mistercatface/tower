import { findSabPathProgressIdx } from "./hpaPathSlot.js";
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathSession.js").HpaPathSession} HpaPathSession */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/** @param {NavSessionState} navState @param {HpaPathWorker} [worker] */
export function clearHpaNavPath(navState, worker) {
    if (worker) worker.releaseOwnedPathSlot(navState);
    else {
        navState.pathSlot = -1;
        navState.pathLen = 0;
    }
    navState.abstractPath = null;
    navState.pathPlanner = null;
}
export function applyHpaAbstractFirst(navState, result, { targetX, targetY, nowMs }) {
    const nodes = result.abstractNodes;
    if (!nodes?.length) return;
    navState.abstractPath = nodes;
    navState.pathPlanner = result.pathPlanner ?? "hpa";
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
    navState.lastUpdate = nowMs;
}
export function applyHpaReplanResult(navState, result, { obstacleGrid, worker, startX, startY, targetX, targetY, nowMs }) {
    if (!result.pathLen) {
        if (result.abstractNodes?.length) applyHpaAbstractFirst(navState, result, { targetX, targetY, nowMs });
        else clearHpaNavPath(navState, worker);
        return;
    }
    navState.pathSlot = result.pathSlot;
    navState.pathLen = result.pathLen;
    navState.pathProgressIdx = findSabPathProgressIdx(startX, startY, worker, result.pathSlot, result.pathLen, obstacleGrid);
    navState.abstractPath = result.abstractNodes ?? null;
    navState.pathPlanner = result.pathPlanner ?? null;
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
    navState.lastUpdate = nowMs;
}
