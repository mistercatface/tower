import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { strokeCircle, traceAabbRect } from "../Canvas/CanvasPath.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} prop @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY */
function propCenterInRect(prop, minX, minY, maxX, maxY) {
    return prop.x >= minX && prop.x <= maxX && prop.y >= minY && prop.y <= maxY;
}
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
export function findSandboxPropsInWorldRect(state, registry, x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const meta = getSandboxEntityMeta(state);
    /** @type {object[]} */
    const result = [];
    registry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || meta.hasAssemblyMembership(prop.id)) return;
        if (propCenterInRect(prop, minX, minY, maxX, maxY)) result.push(prop);
    });
    return result;
}
/** @param {object} prop */
function selectionRingRadius(prop, lineScale) {
    const base = prop.getBoundingRadius?.() ?? prop.radius ?? 8;
    return base + 3 * lineScale;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ selectedProps: object[], showRings: boolean }} options
 */
export function drawSandboxSelectionRings(ctx, { selectedProps, showRings }) {
    if (!showRings || selectedProps.length === 0) return;
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    ctx.strokeStyle = "rgba(120, 200, 255, 0.65)";
    ctx.lineWidth = lineScale;
    for (let i = 0; i < selectedProps.length; i++) {
        const prop = selectedProps[i];
        strokeCircle(ctx, prop.x, prop.y, selectionRingRadius(prop, lineScale));
    }
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ marqueeRect: { minX: number, minY: number, maxX: number, maxY: number } | null }} options
 */
export function drawSandboxMarquee(ctx, { marqueeRect }) {
    if (!marqueeRect) return;
    const lineScale = getCanvasLineScale(ctx);
    const { minX, minY, maxX, maxY } = marqueeRect;
    ctx.save();
    ctx.fillStyle = "rgba(120, 200, 255, 0.08)";
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.strokeStyle = "rgba(120, 200, 255, 0.55)";
    ctx.lineWidth = lineScale;
    ctx.setLineDash([4 * lineScale, 3 * lineScale]);
    ctx.beginPath();
    traceAabbRect(ctx, marqueeRect);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   selectedProps: object[],
 *   showRings: boolean,
 *   marqueeRect: { minX: number, minY: number, maxX: number, maxY: number } | null,
 * }} options
 */
export function drawSandboxSelectionOverlay(ctx, { selectedProps, showRings, marqueeRect }) {
    drawSandboxSelectionRings(ctx, { selectedProps, showRings });
    drawSandboxMarquee(ctx, { marqueeRect });
}
