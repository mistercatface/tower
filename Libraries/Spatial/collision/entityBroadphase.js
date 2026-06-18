import { isStandTipActive } from "../../Props/standTipMotion.js";
import { lengthXY, speedSqXY } from "../../Math/Vec2.js";
import { broadphaseBoundsFromShapeInto, createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import { circlesOverlap } from "./overlap.js";
import { SatCollision } from "./SatCollision.js";
export const MOVING_SPEED_SQ = 0.25;
/** |angularVelocity| above this counts as kinematically active (rad/s). */
export const ROTATING_ANGULAR_SQ = 0.08 * 0.08;
/** Margin beyond combined entity extents for neighbor queries. */
export const NEIGHBOR_QUERY_PAD = 15;
/** @returns {{ x: number, y: number, angle: number, shapeType: string, shapeSpan: number, halfHx: number, halfHy: number }} */
export function createBroadphaseSnapshot() {
    return { x: NaN, y: NaN, angle: NaN, shapeType: "", shapeSpan: NaN, halfHx: NaN, halfHy: NaN };
}
function entityAngle(entity) {
    if (entity._collisionFacing != null) return entity._collisionFacing;
    return entity.facing ?? entity.angle ?? 0;
}
function entityHalfExtents(entity) {
    return entity._collisionFacing != null ? null : (entity._collisionHalfExtents ?? entity.halfExtents ?? null);
}
function shapeSpan(shape) {
    if (shape.type === "Circle") return shape.radius;
    return shape.boundingRadius ?? shape.getBoundingRadius?.() ?? 0;
}
function ensureBroadphaseCache(entity) {
    if (!entity.broadphaseBounds) entity.broadphaseBounds = createBroadphaseBounds();
    if (!entity.broadphaseSnapshot) entity.broadphaseSnapshot = createBroadphaseSnapshot();
}
/** @param {object} entity */
export function invalidateBroadphaseBounds(entity) {
    if (entity.broadphaseSnapshot) entity.broadphaseSnapshot.x = NaN;
}
/** @param {object} entity */
export function getBroadphaseBounds(entity) {
    ensureBroadphaseCache(entity);
    const x = entity.x;
    const y = entity.y;
    const shape = entity.getShape();
    const angle = entityAngle(entity);
    const halfExtents = entityHalfExtents(entity);
    const span = shapeSpan(shape);
    const snapshot = entity.broadphaseSnapshot;
    const halfHx = halfExtents?.x ?? NaN;
    const halfHy = halfExtents?.y ?? NaN;
    if (
        snapshot.x === x &&
        snapshot.y === y &&
        snapshot.angle === angle &&
        snapshot.shapeType === shape.type &&
        snapshot.shapeSpan === span &&
        snapshot.halfHx === halfHx &&
        snapshot.halfHy === halfHy
    )
        return entity.broadphaseBounds;
    snapshot.x = x;
    snapshot.y = y;
    snapshot.angle = angle;
    snapshot.shapeType = shape.type;
    snapshot.shapeSpan = span;
    snapshot.halfHx = halfHx;
    snapshot.halfHy = halfHy;
    return broadphaseBoundsFromShapeInto(entity.broadphaseBounds, shape, x, y, angle, halfExtents);
}
/** Furthest collision edge from entity center (circle radius or OBB corner distance). */
export function entityBroadphaseExtent(entity) {
    const bounds = getBroadphaseBounds(entity);
    if (bounds.kind === "circle") return bounds.r;
    return lengthXY(bounds.hx, bounds.hy);
}
export function isMovingEntity(entity) {
    const vx = entity.vx || 0;
    const vy = entity.vy || 0;
    return speedSqXY(vx, vy) > MOVING_SPEED_SQ;
}
export function isRotatingEntity(entity) {
    const w = entity.angularVelocity ?? 0;
    return w * w > ROTATING_ANGULAR_SQ;
}
/** Linear or angular motion — rotating OBBs sweep volume without translation. */
export function isKinematicallyActive(entity) {
    return isMovingEntity(entity) || isRotatingEntity(entity) || isStandTipActive(entity);
}
export function pairShapeOverlap(a, b) {
    const shapeA = a.getShape?.();
    const shapeB = b.getShape?.();
    if (!shapeA || !shapeB) return false;
    return SatCollision.checkCollision(a, shapeA, b, shapeB) != null;
}
function pairRestingOverlap(a, b) {
    const shapeA = a.getShape?.();
    const shapeB = b.getShape?.();
    if (shapeA?.type === "Circle" && shapeB?.type === "Circle") return circlesOverlap(a, b);
    return pairShapeOverlap(a, b);
}
export function pairBroadphaseOverlap(a, b) {
    return pairBroadphaseBoundsOverlap(getBroadphaseBounds(a), getBroadphaseBounds(b));
}
export function shouldResolveKineticPair(a, b) {
    if (!pairBroadphaseOverlap(a, b)) return false;
    if (isKinematicallyActive(a) || isKinematicallyActive(b)) return true;
    if (a.isSleeping && b.isSleeping) return false;
    return pairRestingOverlap(a, b);
}
/** Hot-path gate for kinetic body collision pairs (replaces compiled PairFilter in the physics loop). */
export function allowsKineticCollisionPair(primary, other) {
    if (primary === other) return false;
    if (other.isDead) return false;
    if (!other.strategy?.isKinetic) return false;
    if (primary.id >= other.id) return false;
    return shouldResolveKineticPair(primary, other);
}
