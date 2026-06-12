import { clipToPath, traceAabbRect, traceClosedPolygon, withClip } from "../../Canvas/CanvasPath.js";
/** @param {number} health @param {number} maxHealth */
export function getDamageAlphaFromHealth(health, maxHealth) {
    const healthRatio = health / maxHealth;
    return healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
}
/** @param {number} damageAlpha */
export function wallDamageOverlayStyle(damageAlpha) {
    return `rgba(244, 67, 54, ${damageAlpha})`;
}
/**
 * Clip to a caller-traced path and fill the shared damage tint.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} damageAlpha
 * @param {(ctx: CanvasRenderingContext2D) => void} traceClipPath
 */
export function drawDamageOverlayInClip(ctx, damageAlpha, traceClipPath) {
    if (damageAlpha <= 0) return;
    withClip(ctx, traceClipPath, (ctx) => {
        ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
        ctx.fill();
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../Math/Aabb2D.js").Aabb2D} box @param {number} damageAlpha */
export function drawAabbDamageOverlay(ctx, box, damageAlpha) {
    drawDamageOverlayInClip(ctx, damageAlpha, (ctx) => {
        traceAabbRect(ctx, box);
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points @param {number} damageAlpha */
export function drawPolygonDamageOverlay(ctx, points, damageAlpha) {
    drawDamageOverlayInClip(ctx, damageAlpha, (ctx) => {
        traceClosedPolygon(ctx, points);
    });
}
