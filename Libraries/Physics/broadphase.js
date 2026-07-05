const COMPOUND_BOUNDS_SCRATCH = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
import { computeCompoundLocalBounds, convexFootprintHalfExtents } from "../Math/Poly2D.js";
import { SHAPE_TYPE_ID, getEntityCollisionParts, entityFacing } from "./collisionMath.js";
import { collisionSettings } from "./physicsDefaults.js";
import { aabbContains, createAabb } from "../Math/Aabb2D.js";
import { lengthXY, speedSqXY } from "../Math/Vec2.js";
import { BP_KIND_CIRCLE, kineticDynamicSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab, writeBroadphaseFromBounds, writeStaticKineticSlabSlot, writeActiveKineticBodySlabPose } from "./physicsSlabs.js";

// --- MERGED FROM Broadphase.js ---
export const BROADPHASE_KIND = { Circle: 1, Obb: 2 };
/** @typedef {{ kind: number, cx: number, cy: number, r: number, hx: number, hy: number, cos: number, sin: number }} BroadphaseBounds */
/** @returns {BroadphaseBounds} */
export function createBroadphaseBounds() {
    return { kind: BROADPHASE_KIND.Circle, cx: 0, cy: 0, r: 0, hx: 0, hy: 0, cos: 1, sin: 0 };
}
function intervalsSeparatedObbObb(ax, ay, a, b) {
    const ca = a.cx * ax + a.cy * ay;
    const ra = a.hx * Math.abs(a.cos * ax + a.sin * ay) + a.hy * Math.abs(-a.sin * ax + a.cos * ay);
    const cb = b.cx * ax + b.cy * ay;
    const rb = b.hx * Math.abs(b.cos * ax + b.sin * ay) + b.hy * Math.abs(-b.sin * ax + b.cos * ay);
    return Math.abs(ca - cb) > ra + rb;
}
function obbObbOverlap(a, b) {
    if (intervalsSeparatedObbObb(a.cos, a.sin, a, b)) return false;
    if (intervalsSeparatedObbObb(-a.sin, a.cos, a, b)) return false;
    if (intervalsSeparatedObbObb(b.cos, b.sin, a, b)) return false;
    if (intervalsSeparatedObbObb(-b.sin, b.cos, a, b)) return false;
    return true;
}
function intervalsSeparatedCircleObb(ax, ay, circle, obb) {
    const cc = circle.cx * ax + circle.cy * ay;
    const rc = circle.r;
    const cb = obb.cx * ax + obb.cy * ay;
    const rb = obb.hx * Math.abs(obb.cos * ax + obb.sin * ay) + obb.hy * Math.abs(-obb.sin * ax + obb.cos * ay);
    return Math.abs(cc - cb) > rc + rb;
}
function circleObbOverlap(circle, obb) {
    if (intervalsSeparatedCircleObb(obb.cos, obb.sin, circle, obb)) return false;
    if (intervalsSeparatedCircleObb(-obb.sin, obb.cos, circle, obb)) return false;
    const dx = circle.cx - obb.cx;
    const dy = circle.cy - obb.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1e-6) if (intervalsSeparatedCircleObb(dx / len, dy / len, circle, obb)) return false;
    return true;
}

export function broadphaseBoundsFromCollisionPartsInto(out, parts, cx, cy, angle = 0) {
    if (parts.length <= 1) return broadphaseBoundsFromShapeInto(out, parts[0], cx, cy, angle);
    const bounds = computeCompoundLocalBounds(parts, COMPOUND_BOUNDS_SCRATCH);
    const hx = (bounds.maxX - bounds.minX) * 0.5;
    const hy = (bounds.maxY - bounds.minY) * 0.5;
    const localCx = (bounds.minX + bounds.maxX) * 0.5;
    const localCy = (bounds.minY + bounds.maxY) * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    out.kind = BROADPHASE_KIND.Obb;
    out.cx = cx + localCx * cos - localCy * sin;
    out.cy = cy + localCx * sin + localCy * cos;
    out.cos = cos;
    out.sin = sin;
    out.hx = hx;
    out.hy = hy;
    return out;
}
export function broadphaseBoundsFromShapeInto(out, shape, cx, cy, angle = 0) {
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Circle) {
        out.kind = BROADPHASE_KIND.Circle;
        out.cx = cx;
        out.cy = cy;
        out.r = shape.radius;
        return out;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Polygon) {
        out.kind = BROADPHASE_KIND.Obb;
        out.cx = cx;
        out.cy = cy;
        out.cos = Math.cos(angle);
        out.sin = Math.sin(angle);
        const span = convexFootprintHalfExtents(shape.vertices);
        out.hx = span.x;
        out.hy = span.y;
        return out;
    }
    out.kind = BROADPHASE_KIND.Circle;
    out.cx = cx;
    out.cy = cy;
    out.r = shape.radius || 0;
    return out;
}
export function broadphaseBoundsFromShape(shape, cx, cy, angle = 0) {
    return broadphaseBoundsFromShapeInto(createBroadphaseBounds(), shape, cx, cy, angle);
}
export function pairBroadphaseBoundsOverlap(a, b) {
    if (a.kind === BROADPHASE_KIND.Circle && b.kind === BROADPHASE_KIND.Circle) {
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const radii = a.r + b.r;
        return dx * dx + dy * dy < radii * radii;
    }
    if (a.kind === BROADPHASE_KIND.Circle && b.kind === BROADPHASE_KIND.Obb) return circleObbOverlap(a, b);
    if (a.kind === BROADPHASE_KIND.Obb && b.kind === BROADPHASE_KIND.Circle) return circleObbOverlap(b, a);
    if (a.kind === BROADPHASE_KIND.Obb && b.kind === BROADPHASE_KIND.Obb) return obbObbOverlap(a, b);
    return false;
}

// --- MERGED FROM entityBroadphase.js ---
function kineticActivity() {
    return collisionSettings.kineticActivity;
}
/** @param {number} extent */
export function neighborQueryPadForExtent(extent) {
    const pad = kineticActivity().neighborQueryPad;
    return Math.min(pad.maxPad, Math.max(pad.minPad, extent * pad.padScale));
}
/** @param {object} entity */
export function neighborQueryPadFor(entity) {
    return neighborQueryPadForExtent(entityBroadphaseExtent(entity));
}
/** Bounds queries with no anchor entity — conservative upper pad. */
export function maxNeighborQueryPad() {
    return kineticActivity().neighborQueryPad.maxPad;
}
export function createBroadphaseSnapshot() {
    return { x: NaN, y: NaN, angle: NaN, shapeType: "", shapeSpan: NaN };
}

function entityCollisionSpan(entity) {
    const parts = getEntityCollisionParts(entity);
    if (parts.length <= 1) return parts[0].getBoundingRadius();
    const bounds = computeCompoundLocalBounds(parts, COMPOUND_BOUNDS_SCRATCH);
    return lengthXY((bounds.maxX - bounds.minX) * 0.5, (bounds.maxY - bounds.minY) * 0.5);
}
function ensureBroadphaseCache(entity) {
    if (!entity.broadphaseBounds) entity.broadphaseBounds = createBroadphaseBounds();
    if (!entity.broadphaseSnapshot) entity.broadphaseSnapshot = createBroadphaseSnapshot();
}
export function invalidateBroadphaseBounds(entity) {
    entity._broadphaseDirty = true;
    if (entity.broadphaseSnapshot) entity.broadphaseSnapshot.x = NaN;
}
const ENTITY_AABB_SCRATCH = createAabb();
export function entityBroadphaseAabbInto(out, entity) {
    const bb = getBroadphaseBounds(entity);
    if (bb.kind === BROADPHASE_KIND.Circle) {
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
    const angle = entityFacing(entity);
    const snapshot = entity.broadphaseSnapshot;
    if (!entity._broadphaseDirty && snapshot.x === x && snapshot.y === y && snapshot.angle === angle) return entity.broadphaseBounds;
    const parts = getEntityCollisionParts(entity);
    const multiPart = parts.length > 1;
    const shape = entity.shape;
    const span = multiPart ? entityCollisionSpan(entity) : shape.getBoundingRadius();
    const shapeKey = multiPart ? "multi" : shape.type;
    if (!entity._broadphaseDirty && snapshot.x === x && snapshot.y === y && snapshot.angle === angle && snapshot.shapeType === shapeKey && snapshot.shapeSpan === span) return entity.broadphaseBounds;
    snapshot.x = x;
    snapshot.y = y;
    snapshot.angle = angle;
    snapshot.shapeType = shapeKey;
    snapshot.shapeSpan = span;
    entity._broadphaseDirty = false;
    if (multiPart) return broadphaseBoundsFromCollisionPartsInto(entity.broadphaseBounds, parts, x, y, angle);
    return broadphaseBoundsFromShapeInto(entity.broadphaseBounds, shape, x, y, angle);
}
export function entityBroadphaseExtent(entity) {
    const bounds = getBroadphaseBounds(entity);
    if (bounds.kind === BROADPHASE_KIND.Circle) return bounds.r;
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
export function snapshotKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        writeStaticKineticSlabSlot(entity);
        writeActiveKineticBodySlabPose(entity);
        writeBroadphaseFromBounds(entity._physId, getBroadphaseBounds(entity));
    }
}
export function refreshActiveKineticBodySlabPose(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        const physId = entity._physId;
        writeActiveKineticBodySlabPose(entity);
        if (slab.bpKind[physId] !== BP_KIND_CIRCLE) {
            const angle = entityFacing(entity);
            slab.cos[physId] = Math.cos(angle);
            slab.sin[physId] = Math.sin(angle);
        }
    }
}
export function pairCircleCircleOverlapSnapshotted(a, b) {
    return pairCircleCircleOverlapSlab(a._physId, b._physId);
}
export function pairBroadphaseOverlapSnapshotted(a, b) {
    return pairBroadphaseOverlapSlab(a._physId, b._physId);
}
export function shouldResolveKineticPair(a, b, overlaps) {
    return overlaps && (isKinematicallyActive(a) || isKinematicallyActive(b));
}
export function allowsKineticCollisionPair(primary, other, overlaps) {
    if (primary === other) return false;
    if (!other.strategy?.isKinetic) return false;
    const otherActive = other._activeSlot != null && other._activeSlot >= 0;
    if (otherActive && primary.id >= other.id) return false;
    return shouldResolveKineticPair(primary, other, overlaps);
}

