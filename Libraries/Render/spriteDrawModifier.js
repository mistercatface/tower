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
/** @param {object} entity @param {object} viewport @returns {SpriteDrawModifier | null} */
export function resolveSpriteDrawModifier(entity, viewport) {
    const fn = entity.currentState?.resolveSpriteDrawModifier;
    if (!fn) return null;
    return fn.call(entity.currentState, entity, viewport);
}
/** @param {CanvasRenderingContext2D} ctx @param {SpriteDrawModifier | null | undefined} modifier */
export function prepModifiedBlit(ctx, modifier) {
    if (!modifier) return;
    if (modifier.clipCircle) {
        const { cx, cy, r } = modifier.clipCircle;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
    }
    if (modifier.alpha != null) ctx.globalAlpha *= modifier.alpha;
}
