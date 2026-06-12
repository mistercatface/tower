import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { strokeCircle } from "../Canvas/CanvasPath.js";
import { aabbFromTwoPoints } from "../Math/Aabb2D.js";
import { queryEntitiesInAabbStrict } from "../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry @param {import("../Math/Aabb2D.js").Aabb2D} bounds */
export function findSandboxPropsInWorldRect(state, registry, bounds) {
    const meta = getSandboxEntityMeta(state);
    return queryEntitiesInAabbStrict(registry, bounds, { kinds: ["worldProp"], hitTest: "center", match: (prop) => !meta.hasAssemblyMembership(prop.id) });
}
/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
export function sandboxMarqueeBounds(x1, y1, x2, y2) {
    return aabbFromTwoPoints(x1, y1, x2, y2);
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
 * @param {{ marqueeRect: import("../Math/Aabb2D.js").Aabb2D | null }} options
 */
export function drawSandboxMarquee(ctx, { marqueeRect }) {
    if (!marqueeRect) return;
    drawAabbHighlight(ctx, marqueeRect, { fill: "rgba(120, 200, 255, 0.08)", stroke: "rgba(120, 200, 255, 0.55)", lineWidth: 1, dash: [4, 3] });
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   selectedProps: object[],
 *   showRings: boolean,
 *   marqueeRect: import("../Math/Aabb2D.js").Aabb2D | null,
 * }} options
 */
export function drawSandboxSelectionOverlay(ctx, { selectedProps, showRings, marqueeRect }) {
    drawSandboxSelectionRings(ctx, { selectedProps, showRings });
    drawSandboxMarquee(ctx, { marqueeRect });
}
