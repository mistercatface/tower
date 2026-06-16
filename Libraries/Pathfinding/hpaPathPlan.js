import { findSabPathProgressIdx } from "./hpaPathSlot.js";
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @param {NavSessionState} navState @param {HpaPathWorker} worker */
export function clearHpaNavPath(navState, worker) {
    worker.releaseOwnedPathSlot(navState);
    navState.abstractPath = null;
    navState.pathPlanner = null;
}
export function applyHpaReplanResult(navState, result, { obstacleGrid, worker, startX, startY, targetX, targetY, nowMs }) {
    if (!result.pathLen) {
        clearHpaNavPath(navState, worker);
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
