/**
 * Per-entity navigation session — mutated by path-follow compute and game replan policy.
 */
/**
 * @typedef {object} NavSessionState
 * @property {number} lastUpdate
 * @property {number | null} lastX
 * @property {number | null} lastY
 * @property {number} stuckFrames
 * @property {number} pathProgressIdx
 * @property {number} obstacleGeneration
 * @property {number | null} lastTargetX
 * @property {number | null} lastTargetY
 * @property {number} lastOffPathReplan
 * @property {Array<{ x: number, y: number, id?: string }> | null} [abstractPath]
 * @property {"local" | "hpa" | null} [pathPlanner]
 * @property {number} [hpaReplanRequestId] — 0 = idle; non-zero while worker replan in flight
 * @property {number} [pathSlot] — worker path SAB slot while following a path, -1 when idle
 * @property {number} [pathLen] — cell count in pathSlot SAB; 0 when steering from abstract path array only
 */
/** @param {NavSessionState} navState */
export function navHasPath(navState) {
    return navState.pathLen > 0 && navState.pathSlot >= 0;
}
/** @returns {NavSessionState} */
export function createNavState() {
    return {
        lastUpdate: 0,
        lastX: null,
        lastY: null,
        stuckFrames: 0,
        pathProgressIdx: 0,
        obstacleGeneration: -1,
        lastTargetX: null,
        lastTargetY: null,
        lastOffPathReplan: 0,
        hpaReplanRequestId: 0,
        pathSlot: -1,
        pathLen: 0,
    };
}
export {};
