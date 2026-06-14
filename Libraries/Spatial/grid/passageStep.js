import { isForcefieldEdge, PASSAGE_MODE, passageEdgeBlocksStep } from "./CellEdge.js";
/**
 * @typedef {object} PassageStepContext
 * @property {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @property {object} edge
 * @property {number} ownerCol
 * @property {number} ownerRow
 * @property {number} ownerSide
 * @property {number} crossedSide
 * @property {number} fromCol
 * @property {number} fromRow
 * @property {number} toCol
 * @property {number} toRow
 * @property {boolean} directional
 */
/** @typedef {(ctx: PassageStepContext) => boolean} PassageStepHandler */
/** @type {Map<string, PassageStepHandler>} */
const handlersByMode = new Map();
/** @param {string} passageMode @param {PassageStepHandler} handler */
export function registerPassageStepHandler(passageMode, handler) {
    handlersByMode.set(passageMode, handler);
}
/** @param {PassageStepContext} ctx @returns {boolean} true when the step is blocked */
function defaultForcefieldStep(ctx) {
    return passageEdgeBlocksStep(ctx.edge, ctx.crossedSide, ctx.ownerSide);
}
/**
 * Non-directional step query for a passage edge on its owner cell.
 * @param {PassageStepContext} ctx
 * @returns {boolean}
 */
export function resolvePassageStepUndirected(ctx) {
    const { edge } = ctx;
    if (!isForcefieldEdge(edge)) return false;
    const handler = handlersByMode.get(edge.mode);
    if (handler) return handler({ ...ctx, directional: false });
    if (edge.mode === PASSAGE_MODE.Portal) return true;
    return defaultForcefieldStep({ ...ctx, directional: false });
}
/**
 * Directional step query — from/to cells matter for modes like portal mouth rules.
 * @param {PassageStepContext} ctx
 * @returns {boolean}
 */
export function resolvePassageStepFrom(ctx) {
    const { edge } = ctx;
    if (!isForcefieldEdge(edge)) return false;
    const handler = handlersByMode.get(edge.mode);
    if (handler) return handler({ ...ctx, directional: true });
    if (edge.mode === PASSAGE_MODE.Portal) return true;
    return defaultForcefieldStep({ ...ctx, directional: true });
}
