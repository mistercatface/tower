import { entityBroadphaseExtent, NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
import { createCircleGroundZone } from "./groundZones.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../iso/IsometricProjection.js";
export const DEFAULT_VOID_RADIUS = 8;
export const DEFAULT_VOID_DEPTH = 24;
/** Combined circle reach — center distance at which a prop still overlaps the void mouth. */
export function voidMouthReach(voidRadius, entity) {
    const entityRadius = entity.radius ?? entityBroadphaseExtent(entity) ?? 0;
    return voidRadius + entityRadius;
}
/** @param {number} voidX @param {number} voidY @param {number} voidRadius @param {object} entity */
export function isInsideVoidMouth(voidX, voidY, voidRadius, entity) {
    const dx = voidX - entity.x;
    const dy = voidY - entity.y;
    return Math.hypot(dx, dy) <= voidMouthReach(voidRadius, entity);
}
/** @param {number} x @param {number} y @param {number} [radius] @param {{ id?: string, depth?: number }} [options] */
export function createVoidZone(x, y, radius = DEFAULT_VOID_RADIUS, { id = "void-zone", depth = DEFAULT_VOID_DEPTH } = {}) {
    const zone = createCircleGroundZone(x, y, radius, { id });
    zone.kind = "void";
    zone.depth = depth;
    // Mouth SAT uses zone.shape.radius; broadphase must include entities whose center sits outside
    // the mouth circle but whose body still overlaps (radius + entity extent).
    const pad = NEIGHBOR_QUERY_PAD;
    zone.aabb = { minX: x - radius - pad, minY: y - radius - pad, maxX: x + radius + pad, maxY: y + radius + pad };
    return zone;
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createVoidZone>} zone @param {number} viewerX @param {number} viewerY */
export function drawVoidZone(ctx, zone, viewerX, viewerY) {
    const mouthRadius = zone.shape.radius;
    const pocketDepth = zone.depth ?? DEFAULT_VOID_DEPTH;
    const step = pocketDepth / 8;
    for (let H = 0; H >= -pocketDepth; H -= step) {
        const dx = zone.x - viewerX;
        const dy = zone.y - viewerY;
        const dist = Math.hypot(dx, dy);
        const alpha = (H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
        const projX = dist === 0 ? zone.x : zone.x + dx * alpha;
        const projY = dist === 0 ? zone.y : zone.y + dy * alpha;
        const layerRadius = mouthRadius * (CAMERA_HEIGHT / (CAMERA_HEIGHT - H));
        const ratio = Math.min(1, -H / pocketDepth);
        const lightness = Math.max(0, 14 - ratio * 14);
        ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
        ctx.beginPath();
        ctx.arc(projX, projY, layerRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, mouthRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
}
