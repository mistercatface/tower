import { broadphaseBoundsFromShape, pairBroadphaseBoundsOverlap } from "./Broadphase.js";

export const MOVING_SPEED_SQ = 0.25;

/** Margin beyond combined entity extents for neighbor queries (separation, etc.). */
export const NEIGHBOR_QUERY_PAD = 15;

function entityAngle(entity) {
    return entity.facing ?? entity.angle ?? 0;
}

/** Furthest collision edge from entity center (circle radius or OBB corner distance). */
export function entityBroadphaseExtent(entity) {
    const bounds = getBroadphaseBounds(entity);
    if (bounds.kind === "circle") return bounds.r;
    return Math.hypot(bounds.hx, bounds.hy);
}

export function isMovingEntity(entity) {
    const vx = entity.vx || 0;
    const vy = entity.vy || 0;
    return vx * vx + vy * vy > MOVING_SPEED_SQ;
}

/**
 * @returns {{ kind: 'circle', cx: number, cy: number, r: number } | { kind: 'obb', cx: number, cy: number, hx: number, hy: number, cos: number, sin: number }}
 */
export function getBroadphaseBounds(entity) {
    const shape = entity.getShape();
    return broadphaseBoundsFromShape(
        shape,
        entity.x,
        entity.y,
        entityAngle(entity),
        entity.halfExtents ?? null,
    );
}

export function pairBroadphaseOverlap(a, b) {
    return pairBroadphaseBoundsOverlap(getBroadphaseBounds(a), getBroadphaseBounds(b));
}

export function isPairActive(a, b) {
    return isMovingEntity(a) || isMovingEntity(b);
}

export function shouldResolveActorPushable(actor, pickup) {
    return isPairActive(actor, pickup) || pairBroadphaseOverlap(actor, pickup);
}
