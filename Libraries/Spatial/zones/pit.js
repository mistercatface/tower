import { entityBroadphaseExtent, NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../iso/IsometricProjection.js";
export const DEFAULT_PIT_RADIUS = 8;
export const DEFAULT_PIT_DEPTH = 24;
/** Combined circle reach — center distance at which a prop still overlaps the pit mouth. */
export function voidMouthReach(pitRadius, entity) {
    const entityRadius = entity.radius ?? entityBroadphaseExtent(entity) ?? 0;
    return pitRadius + entityRadius;
}
/** @param {number} pitX @param {number} pitY @param {number} pitRadius @param {object} entity */
export function isInsideVoidMouth(pitX, pitY, pitRadius, entity) {
    const dx = pitX - entity.x;
    const dy = pitY - entity.y;
    return Math.hypot(dx, dy) <= voidMouthReach(pitRadius, entity);
}
/** @param {object} pad @param {number} radius */
export function syncSinkPadAabb(pad, radius) {
    const margin = NEIGHBOR_QUERY_PAD;
    pad.aabb = { minX: pad.x - radius - margin, minY: pad.y - radius - margin, maxX: pad.x + radius + margin, maxY: pad.y + radius + margin };
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pad @param {number} viewerX @param {number} viewerY */
export function drawPit(ctx, pad, viewerX, viewerY) {
    const mouthRadius = pad.shape.radius;
    const pocketDepth = pad.sinkDepth ?? DEFAULT_PIT_DEPTH;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, mouthRadius, 0, Math.PI * 2);
    ctx.clip();
    // Draw the black background of the void pit (fixed at the mouth position)
    ctx.fillStyle = "hsl(0, 0%, 0%)";
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, mouthRadius, 0, Math.PI * 2);
    ctx.fill();
    // Draw the shifting inside of the well/funnel (shifting away from the camera)
    const step = pocketDepth / 8;
    for (let H = -step; H >= -pocketDepth; H -= step) {
        const dx = pad.x - viewerX;
        const dy = pad.y - viewerY;
        const dist = Math.hypot(dx, dy);
        const alpha = (-H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
        const projX = dist === 0 ? pad.x : pad.x + dx * alpha;
        const projY = dist === 0 ? pad.y : pad.y + dy * alpha;
        const layerRadius = mouthRadius * (CAMERA_HEIGHT / (CAMERA_HEIGHT - H));
        const ratio = Math.min(1, -H / pocketDepth);
        const lightness = Math.max(0, 14 - ratio * 14);
        ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
        ctx.beginPath();
        ctx.arc(projX, projY, layerRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, mouthRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
}
