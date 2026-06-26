import { collisionSettings } from "../../Collision/collisionDefaults.js";
import { aabbContains, createAabb } from "../../Math/Aabb2D.js";
import { lengthXY, speedSqXY } from "../../Math/Vec2.js";
import { broadphaseBoundsFromCollisionPartsInto, broadphaseBoundsFromShapeInto, createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import {
    BP_KIND_CIRCLE,
    kineticDynamicSlab,
    pairBroadphaseOverlapSlab,
    pairCircleCircleOverlapSlab,
    writeBroadphaseFromBounds,
    writeStaticKineticSlabSlot,
    writeActiveKineticBodySlabPose,
} from "./kineticBodySlab.js";
import { getEntityCollisionParts } from "./SatCollision.js";
function kineticActivity() {
    return collisionSettings.kineticActivity;
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
function entityCollisionSpan(entity) {
    const parts = getEntityCollisionParts(entity);
    if (parts.length <= 1) return parts[0].getBoundingRadius();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        if (part.type === "Circle") {
            minX = Math.min(minX, -part.radius);
            maxX = Math.max(maxX, part.radius);
            minY = Math.min(minY, -part.radius);
            maxY = Math.max(maxY, part.radius);
            continue;
        }
        const verts = part.vertices;
        for (let i = 0; i < verts.length; i++) {
            minX = Math.min(minX, verts[i].x);
            maxX = Math.max(maxX, verts[i].x);
            minY = Math.min(minY, verts[i].y);
            maxY = Math.max(maxY, verts[i].y);
        }
    }
    return lengthXY((maxX - minX) * 0.5, (maxY - minY) * 0.5);
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
    const angle = entityAngle(entity);
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
export function snapshotKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        writeStaticKineticSlabSlot(entity);
        writeActiveKineticBodySlabPose(entity);
        writeBroadphaseFromBounds(entity._physId, getBroadphaseBounds(entity));
    }
}
export function snapshotActiveBroadphaseBounds(bodies) {
    snapshotKineticBodySlab(bodies);
}
export function refreshActiveKineticBodySlabPose(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        const physId = entity._physId;
        writeActiveKineticBodySlabPose(entity);
        if (slab.bpKind[physId] !== BP_KIND_CIRCLE) writeBroadphaseFromBounds(physId, getBroadphaseBounds(entity));
    }
}
export function pairCircleCircleOverlapSnapshotted(a, b) {
    return pairCircleCircleOverlapSlab(a._physId, b._physId);
}
export function pairBroadphaseOverlapSnapshotted(a, b) {
    return pairBroadphaseOverlapSlab(a._physId, b._physId);
}
export function shouldResolveKineticPair(a, b, overlaps) {
    if (!overlaps) return false;
    if (isKinematicallyActive(a) || isKinematicallyActive(b)) return true;
    if (a.isSleeping || b.isSleeping) return false;
    return false;
}
export function allowsKineticCollisionPair(primary, other, overlaps) {
    if (primary === other) return false;
    if (!other.strategy?.isKinetic) return false;
    if (primary.id >= other.id) return false;
    return shouldResolveKineticPair(primary, other, overlaps);
}
