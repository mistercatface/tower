import { clipToPath, traceCircle } from "../Canvas/CanvasPath.js";
/**
 * Post-bake draw transforms (alpha, clip, scale, position).
 * Applied at ctx.drawImage time — never in quantized sprite cache keys.
 *
 * @typedef {{
 *   alpha?: number,
 *   scale?: number,
 *   clipCircle?: { cx: number, cy: number, r: number },
 *   drawX?: number,
 *   drawY?: number,
 * }} SpriteDrawModifier
 */
/** @param {object} entity @param {number} px @param {number} py @returns {SpriteDrawModifier | null} */
export function resolveSpriteDrawModifier(entity, px, py) {
    const fn = entity.currentState?.resolveSpriteDrawModifier;
    if (!fn) return null;
    return fn.call(entity.currentState, entity, px, py);
}
/** @param {CanvasRenderingContext2D} ctx @param {SpriteDrawModifier | null | undefined} modifier */
export function prepModifiedBlit(ctx, modifier) {
    if (!modifier) return;
    if (modifier.clipCircle) {
        const { cx, cy, r } = modifier.clipCircle;
        clipToPath(ctx, (ctx) => {
            traceCircle(ctx, cx, cy, r);
        });
    }
    if (modifier.alpha != null) ctx.globalAlpha *= modifier.alpha;
}
