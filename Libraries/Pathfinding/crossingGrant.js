/**
 * Nav-issued authorization for crossing a boundary mouth cell.
 * Physics reads the synced copy on the entity; nav session is the source of truth.
 */
import { sabPathWorldAt } from "./hpaPathSlot.js";
/** @typedef {{ col: number, row: number }} CrossingGrant */
const CROSSING_INTENT_EPS = 0.05;
/** @param {{ x: number, y: number }} cross @param {number} vx @param {number} vy @param {number} dispX @param {number} dispY */
export function hasCrossingIntent(cross, vx, vy, dispX, dispY) {
    if (vx * cross.x + vy * cross.y > CROSSING_INTENT_EPS) return true;
    return dispX * cross.x + dispY * cross.y > CROSSING_INTENT_EPS;
}
/**
 * Grant + nav-path contract for boundary intake / collision skip.
 * @param {object} entity
 * @param {number} grantCol
 * @param {number} grantRow
 * @param {{ x: number, y: number }} cross
 */
export function crossingGrantAllows(entity, grantCol, grantRow, cross, vx, vy, dispX, dispY) {
    const crossing = hasCrossingIntent(cross, vx, vy, dispX, dispY);
    const grant = entity._crossingGrant;
    if (grant) return grant.col === grantCol && grant.row === grantRow && crossing;
    if (entity._navPathActive) return false;
    return crossing;
}
/** @param {object} entity */
export function clearCrossingGrantOnEntity(entity) {
    delete entity._crossingGrant;
    delete entity._navPathActive;
}
/**
 * @param {import("./navSession.js").NavSessionState & { boundaryHopIdx?: number | null, navPathActive?: boolean, crossingGrant?: CrossingGrant | null, pathSlot?: number, pathLen?: number }} navState
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("./HpaPathWorker.js").HpaPathWorker | null} [worker]
 */
export function refreshNavCrossingGrant(navState, grid, worker = null) {
    navState.navPathActive = navState.pathLen > 0 || !!navState.path?.length;
    navState.crossingGrant = null;
    const hopIdx = navState.boundaryHopIdx;
    if (hopIdx == null) return;
    if (navState.pathProgressIdx !== hopIdx) return;
    const wp = worker && navState.pathSlot >= 0 && navState.pathLen > 0 ? sabPathWorldAt(worker, navState.pathSlot, hopIdx, grid) : navState.path?.[hopIdx];
    if (!wp) return;
    const { col, row } = grid.worldToGrid(wp.x, wp.y);
    navState.crossingGrant = { col, row };
}
/**
 * @param {object} entity
 * @param {import("./navSession.js").NavSessionState & { navPathActive?: boolean, crossingGrant?: CrossingGrant | null }} navState
 */
export function syncCrossingGrantToEntity(entity, navState) {
    if (navState.navPathActive) entity._navPathActive = true;
    else delete entity._navPathActive;
    if (navState.crossingGrant) entity._crossingGrant = navState.crossingGrant;
    else delete entity._crossingGrant;
}
