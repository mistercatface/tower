import { entityBroadphaseExtent } from "../collision/entityBroadphase.js";
import { syncPadQueryAabb } from "./floorShapes.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../iso/IsometricProjection.js";
export const DEFAULT_PIT_RADIUS = 8;
export const DEFAULT_PIT_DEPTH = 24;
/** @param {object} entity */
export function voidEntityRadius(entity) {
    return entity.radius ?? entityBroadphaseExtent(entity) ?? 0;
}
/** Combined circle reach — center distance at which a prop still overlaps the pit mouth. */
export function voidMouthReach(pitRadius, entity) {
    return pitRadius + voidEntityRadius(entity);
}
/** @param {number} pitX @param {number} pitY @param {number} pitRadius @param {object} entity */
export function isInsideVoidMouth(pitX, pitY, pitRadius, entity) {
    const dx = pitX - entity.x;
    const dy = pitY - entity.y;
    return Math.hypot(dx, dy) <= voidMouthReach(pitRadius, entity);
}
/** Fraction of entity radius allowed to hang past the mouth lip (0 = strict full enclosure). */
export const DEFAULT_VOID_CAPTURE_TOLERANCE = 0.35;
/** True when the entity collision circle is entirely inside the pit mouth (not just overlapping). */
export function isFullyEnclosedInVoidMouth(pitX, pitY, pitRadius, entity) {
    return isVoidSinkCaptured(pitX, pitY, pitRadius, entity, 0);
}
/** True when the entity collision circle can fit through the mouth at all. */
export function canEntityFitVoidPit(pitRadius, entity) {
    const entityRadius = voidEntityRadius(entity);
    return entityRadius > 0 && pitRadius > 0 && entityRadius <= pitRadius;
}
/**
 * True when enough of the entity is inside the mouth to start falling.
 * Entity must fit the pit (`entityRadius <= pitRadius`); tolerance only
 * controls how much may hang past the lip once it fits.
 *
 * @param {number} [captureTolerance]
 */
export function isVoidSinkCaptured(pitX, pitY, pitRadius, entity, captureTolerance = DEFAULT_VOID_CAPTURE_TOLERANCE) {
    const entityRadius = voidEntityRadius(entity);
    if (!canEntityFitVoidPit(pitRadius, entity)) return false;
    const dist = Math.hypot(pitX - entity.x, pitY - entity.y);
    if (dist >= pitRadius + entityRadius) return false;
    const overlap = pitRadius + entityRadius - dist;
    const requiredOverlap = entityRadius * (1 - captureTolerance);
    return overlap >= requiredOverlap;
}
/** @param {object} pad @param {number} radius */
export function syncSinkPadAabb(pad, radius) {
    syncPadQueryAabb(pad, radius, radius);
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pad @param {number} viewerX @param {number} viewerY */
export function drawPitInterior(ctx, pad, viewerX, viewerY) {
    const mouthRadius = pad.shape.radius;
    const pocketDepth = pad.sinkDepth ?? DEFAULT_PIT_DEPTH;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, mouthRadius, 0, Math.PI * 2);
    ctx.clip();
    const step = pocketDepth / 8;
    for (let H = 0; H >= -pocketDepth; H -= step) {
        const dx = pad.x - viewerX;
        const dy = pad.y - viewerY;
        const dist = Math.hypot(dx, dy);
        const alpha = (H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
        const projX = dist === 0 ? pad.x : pad.x + dx * alpha;
        const projY = dist === 0 ? pad.y : pad.y + dy * alpha;
        const layerRadius = mouthRadius * (CAMERA_HEIGHT / (CAMERA_HEIGHT - H));
        const ratio = Math.min(1, -H / pocketDepth);
        const lightness = Math.max(0, 100 - ratio * 100);
        ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
        ctx.beginPath();
        ctx.arc(projX, projY, layerRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
