import { findSabPathProgressIdx } from "./hpaPathSlot.js";
/** @typedef {import("./navSession.js").NavSessionState} NavSessionState */
/** @typedef {import("./HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @param {NavSessionState} navState @param {HpaPathWorker} worker */
export function clearHpaNavPath(navState, worker) {
    worker.releaseOwnedPathSlot(navState);
}
export function applyHpaReplanResult(navState, result, { obstacleGrid, worker, startX, startY, targetX, targetY, topologyKey, navTopology }) {
    navState.topologyKey = topologyKey;
    if (!result.pathLen) {
        clearHpaNavPath(navState, worker);
        return;
    }
    worker.releaseOwnedPathSlot(navState);
    navState.pathSlot = result.pathSlot;
    navState.pathLen = result.pathLen;
    navState.pathProgressIdx = findSabPathProgressIdx(startX, startY, worker, result.pathSlot, result.pathLen, obstacleGrid, navTopology);
    navState.lastTargetX = targetX;
    navState.lastTargetY = targetY;
}
