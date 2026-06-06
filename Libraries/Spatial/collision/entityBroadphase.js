import { broadphaseBoundsFromShape, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import { SatCollision } from "./SatCollision.js";

export const MOVING_SPEED_SQ = 0.25;
/** |angularVelocity| above this counts as kinematically active (rad/s). */
export const ROTATING_ANGULAR_SQ = 0.08 * 0.08;

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

export function isRotatingEntity(entity) {
    const w = entity.angularVelocity ?? 0;
    return w * w > ROTATING_ANGULAR_SQ;
}

/** Linear or angular motion — rotating OBBs sweep volume without translation. */
export function isKinematicallyActive(entity) {
    return isMovingEntity(entity) || isRotatingEntity(entity);
}

export function pairShapeOverlap(a, b) {
    const shapeA = a.getShape?.();
    const shapeB = b.getShape?.();
    if (!shapeA || !shapeB) return false;
    return SatCollision.checkCollision(a, shapeA, b, shapeB) != null;
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
    return isKinematicallyActive(a) || isKinematicallyActive(b);
}

export function shouldResolvePushablePair(a, b) {
    if (!pairBroadphaseOverlap(a, b)) return false;
    if (isKinematicallyActive(a) || isKinematicallyActive(b)) return true;
    if (a.isSleeping && b.isSleeping) return false;
    return pairShapeOverlap(a, b);
}

export function shouldResolveActorPushable(actor, pickup) {
    if (!pairBroadphaseOverlap(actor, pickup)) return false;
    if (isKinematicallyActive(actor) || isKinematicallyActive(pickup)) return true;
    return pairShapeOverlap(actor, pickup);
}
