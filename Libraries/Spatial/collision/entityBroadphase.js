import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { aabbContains, createAabb } from "../../Math/Aabb2D.js";
import { lengthXY, speedSqXY } from "../../Math/Vec2.js";
import { broadphaseBoundsFromCollisionPartsInto, broadphaseBoundsFromShapeInto, createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import { getEntityCollisionParts } from "./SatCollision.js";
function kineticActivity() {
    return getCollisionSettings().kineticActivity;
}
export function kineticNeighborQueryPad() {
    return kineticActivity().neighborQueryPad;
}
export function createBroadphaseSnapshot() {
    return { x: NaN, y: NaN, angle: NaN, shapeType: "", shapeSpan: NaN };
}
function entityAngle(entity) {
    if (entity._collisionFacing != null) return entity._collisionFacing;
    return entity.facing ?? entity.angle ?? 0;
}
function shapeSpan(shape) {
    if (shape.type === "Circle") return shape.radius;
    return shape.boundingRadius ?? shape.getBoundingRadius?.() ?? 0;
}
function ensureBroadphaseCache(entity) {
    if (!entity.broadphaseBounds) entity.broadphaseBounds = createBroadphaseBounds();
    if (!entity.broadphaseSnapshot) entity.broadphaseSnapshot = createBroadphaseSnapshot();
}
export function invalidateBroadphaseBounds(entity) {
    if (entity.broadphaseSnapshot) entity.broadphaseSnapshot.x = NaN;
}
function unionLocalHalfExtents(parts) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let p = 0; p < parts.length; p++) {
        const verts = parts[p].vertices;
        for (let i = 0; i < verts.length; i++) {
            minX = Math.min(minX, verts[i].x);
            maxX = Math.max(maxX, verts[i].x);
            minY = Math.min(minY, verts[i].y);
            maxY = Math.max(maxY, verts[i].y);
        }
    }
    return { x: (maxX - minX) * 0.5, y: (maxY - minY) * 0.5 };
}
function entityCollisionSpan(entity) {
    const parts = getEntityCollisionParts(entity);
    if (parts.length <= 1) return shapeSpan(parts[0]);
    const { x, y } = unionLocalHalfExtents(parts);
    return lengthXY(x, y);
}
const ENTITY_AABB_SCRATCH = createAabb();
export function entityBroadphaseAabbInto(out, entity) {
    const bb = getBroadphaseBounds(entity);
    if (bb.kind === "circle") {
        out.minX = bb.cx - bb.r;
        out.minY = bb.cy - bb.r;
        out.maxX = bb.cx + bb.r;
        out.maxY = bb.cy + bb.r;
        return out;
    }
    const cos = bb.cos;
    const sin = bb.sin;
    const hx = bb.hx;
    const hy = bb.hy;
    const cx = bb.cx;
    const cy = bb.cy;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let sx = -1; sx <= 1; sx += 2)
        for (let sy = -1; sy <= 1; sy += 2) {
            const lx = sx * hx;
            const ly = sy * hy;
            const wx = cx + lx * cos - ly * sin;
            const wy = cy + lx * sin + ly * cos;
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
        }
    out.minX = minX;
    out.minY = minY;
    out.maxX = maxX;
    out.maxY = maxY;
    return out;
}
export function entityContainedInAabb(entity, outer) {
    entityBroadphaseAabbInto(ENTITY_AABB_SCRATCH, entity);
    return aabbContains(outer, ENTITY_AABB_SCRATCH);
}
export function getBroadphaseBounds(entity) {
    ensureBroadphaseCache(entity);
    const x = entity.x;
    const y = entity.y;
    const parts = getEntityCollisionParts(entity);
    const multiPart = parts.length > 1;
    const shape = entity.getShape();
    const angle = entityAngle(entity);
    const span = multiPart ? entityCollisionSpan(entity) : shapeSpan(shape);
    const snapshot = entity.broadphaseSnapshot;
    const shapeKey = multiPart ? "multi" : shape.type;
    if (snapshot.x === x && snapshot.y === y && snapshot.angle === angle && snapshot.shapeType === shapeKey && snapshot.shapeSpan === span) return entity.broadphaseBounds;
    snapshot.x = x;
    snapshot.y = y;
    snapshot.angle = angle;
    snapshot.shapeType = shapeKey;
    snapshot.shapeSpan = span;
    if (multiPart) return broadphaseBoundsFromCollisionPartsInto(entity.broadphaseBounds, parts, x, y, angle);
    return broadphaseBoundsFromShapeInto(entity.broadphaseBounds, shape, x, y, angle);
}
export function entityBroadphaseExtent(entity) {
    const bounds = getBroadphaseBounds(entity);
    if (bounds.kind === "circle") return bounds.r;
    return lengthXY(bounds.hx, bounds.hy);
}
export function isMovingEntity(entity) {
    const vx = entity.vx || 0;
    const vy = entity.vy || 0;
    return speedSqXY(vx, vy) > kineticActivity().movingSpeedSq;
}
export function isRotatingEntity(entity) {
    const w = entity.angularVelocity ?? 0;
    const rotatingSpeedRad = kineticActivity().rotatingSpeedRad;
    return w * w > rotatingSpeedRad * rotatingSpeedRad;
}
export function isKinematicallyActive(entity) {
    return isMovingEntity(entity) || isRotatingEntity(entity);
}
export function pairBroadphaseOverlap(a, b) {
    return pairBroadphaseBoundsOverlap(getBroadphaseBounds(a), getBroadphaseBounds(b));
}
export function shouldResolveKineticPair(a, b) {
    if (!pairBroadphaseOverlap(a, b)) return false;
    if (isKinematicallyActive(a) || isKinematicallyActive(b)) return true;
    if (a.isSleeping || b.isSleeping) return false;
    return false;
}
export function allowsKineticCollisionPair(primary, other) {
    if (primary === other) return false;
    if (!other.strategy?.isKinetic) return false;
    if (primary.id >= other.id) return false;
    return shouldResolveKineticPair(primary, other);
}
