import { isForcefieldEdge, PASSAGE_MODE, passageEdgeBlocksCollision, passageEdgeEmitsCollision } from "./CellEdge.js";
/** @typedef {'collide' | 'skip' | 'consumed'} PassageWallContactResult */
/**
 * @typedef {object} PassageWallContactContext
 * @property {object | null} state
 * @property {object} entity
 * @property {object} segment
 * @property {object} edge
 * @property {number} ownerCol
 * @property {number} ownerRow
 * @property {number} ownerSide
 * @property {number} bodyRadius
 * @property {number} vx
 * @property {number} vy
 * @property {number} dispX
 * @property {number} dispY
 * @property {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
/** @typedef {(ctx: PassageWallContactContext) => PassageWallContactResult} PassageWallContactHandler */
/** @type {Map<string, PassageWallContactHandler>} */
const handlersByMode = new Map();
/** Sim state for the current wall-resolve / collision pass; set by the collision driver. @type {object | null} */
let passageWallContactRunState = null;
/** @param {object | null} state */
export function beginPassageWallContactRun(state) {
    passageWallContactRunState = state;
}
export function endPassageWallContactRun() {
    passageWallContactRunState = null;
}
/** @param {string} passageMode @param {PassageWallContactHandler} handler */
export function registerPassageWallContactHandler(passageMode, handler) {
    handlersByMode.set(passageMode, handler);
}
/** Built-in laser/tripwire/one-way — no game-layer registration required. */
function defaultForcefieldWallContact(ctx) {
    const { edge, ownerSide, vx, vy } = ctx;
    if (!passageEdgeEmitsCollision(edge)) return "skip";
    if (!passageEdgeBlocksCollision(edge, ownerSide, vx, vy)) return "skip";
    return "collide";
}
/**
 * Wall resolve consults this once per passage segment before penetration.
 *
 * @param {PassageWallContactContext} ctx
 * @returns {PassageWallContactResult}
 */
export function resolvePassageWallContact(ctx) {
    const { edge } = ctx;
    if (!isForcefieldEdge(edge)) return "collide";
    const fullCtx = { ...ctx, state: ctx.state ?? passageWallContactRunState };
    const handler = handlersByMode.get(edge.mode);
    if (handler) return handler(fullCtx);
    if (edge.mode === PASSAGE_MODE.Portal) return "collide";
    return defaultForcefieldWallContact(fullCtx);
}
