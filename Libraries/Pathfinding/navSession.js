/**
 * Per-entity navigation session — mutated by path-follow compute and game replan policy.
 */
/**
 * @typedef {object} NavSessionState
 * @property {{ x: number, y: number }[] | null} path
 * @property {number} lastUpdate
 * @property {number | null} lastX
 * @property {number | null} lastY
 * @property {number} stuckFrames
 * @property {number} pathProgressIdx
 * @property {number} obstacleGeneration
 * @property {number | null} lastTargetX
 * @property {number | null} lastTargetY
 * @property {number} lastOffPathReplan
 * @property {number | null} [boundaryHopIdx] — world-path index of an upcoming boundary hop mouth
 * @property {boolean} [navPathActive] — entity is following a nav path; blocks manual boundary crossing
 * @property {import("./crossingGrant.js").CrossingGrant | null} [crossingGrant] — mouth cell authorized for the current hop
 */
/** @returns {NavSessionState} */
export function createNavState() {
    return { path: null, lastUpdate: 0, lastX: null, lastY: null, stuckFrames: 0, pathProgressIdx: 0, obstacleGeneration: -1, lastTargetX: null, lastTargetY: null, lastOffPathReplan: 0 };
}
export {};
