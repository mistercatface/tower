import { multiplyQuatInto, axisAngleQuatInto, rotateVecByQuatInto, distanceToAabb, rotateXYIntoF32, distanceSqToLineSegment, quantizeAngle, clamp, lengthXY, dotXY, addXY, speedSqXY, aabbContains, normalizeAngle, polygonSecondMomentAboutCentroid2D, polygonSignedArea2D, polygonCentroid2DInto, reversePolygonWinding, findExtremeVertexIndex, findClosestWorldVertexIndex, computeCompoundLocalBoundsF32, convexFootprintHalfExtents, boxLocalFootprint, angleDelta, emptyAabbF32, growAabbFromCenterF32, padAabbF32, centerReachAabbF32 } from "../Math/math.js";
import {
    ENGINE_F32,
    ENGINE_PHYS_BASE,
    ENGINE_BOUNDS_BASE,
    B_QUERY,
    B_PAD,
    M_OUT_CX,
    M_OUT_CY,
    M_OUT_QW,
    M_OUT_QX,
    M_OUT_QY,
    M_OUT_QZ,
    M_OUT_VX,
    M_OUT_VY,
    M_OUT_VZ,
    P_COMPOUND,
    entityRefs,
    entityRollQw,
    entityRollQx,
    entityRollQy,
    entityRollQz,
    ensureGrowI32,
    ensureGrowF32,
    ensureGrowU8,
    ensureGrowU16,
    kineticDynamicSlab,
    kineticStaticSlab,
    kineticConstraintSlab,
    kineticConstraintStore,
    kineticContactBuffer,
    kineticPairBuffer,
    persistedKineticPairBuffer,
    warmStartKeys,
    warmStartGen,
    warmStartJn,
    warmStartJt,
    warmStartState,
    orderSeenPhysIds,
    orderUsedItems,
    bucketRoots,
    sIslandPhysA,
    sIslandPhysB,
    sBucketCounts,
    sBucketStartIdx,
    sBucketFillIdx,
    sIslandAwake,
    orderOrderedIdxs,
    sleepIslandParent as parent,
    sleepIslandRank as rank,
    sleepComponentRoot as componentRoot,
    sleepComponentMaxSpeedSq as componentMaxSpeedSq,
    sleepComponentHasBlocker as componentHasBlocker,
    sleepComponentMemberCount as componentMemberCount,
    kineticSleepScratch,
    pairHashKeys,
    sleepContactBuffer,
    MAX_PHYS_BODIES,
    MAX_CONTACTS,
    MAX_KINETIC_PAIRS,
    MAX_KINETIC_CONSTRAINTS,
    MAX_ISLAND_GROUPS,
    WARM_START_CACHE_SIZE,
    WARM_START_CACHE_MASK,
    PAIR_HASH_CAPACITY,
    staticWallSegmentSlab,
    GrowI32,
    CONSTRAINT_TYPE_DISTANCE,
    CONSTRAINT_TYPE_ANGLE,
    SHAPE_TYPE_CIRCLE,
    SHAPE_TYPE_POLYGON,
} from "../../Core/engineMemory.js";
export { CONSTRAINT_TYPE_DISTANCE, CONSTRAINT_TYPE_ANGLE, SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON };
import { syncEntitySlotPoseFromRef, writebackEntitySlotPoseToRef } from "../Entity/entitySlots.js";
import { BeltPacked, DEFAULT_FLOOR_BELT_FORCE } from "../Spatial/belts.js";
/** Library baseline — games override via `gameDefinition.physicsSettings`. */
/** @typedef {typeof LIBRARY_PHYSICS_DEFAULTS} LibraryPhysicsSettings */
export const LIBRARY_PHYSICS_DEFAULTS = { groundNavRoll: { maxSpeed: 180, accel: 600, stopRadius: 6 }, groundNavHpa: { stopRadius: 8, pathWaypointArrivalMin: 12, pathWaypointArrivalRadiusFactor: 1.5 } };
export const physicsSettings = structuredClone(LIBRARY_PHYSICS_DEFAULTS);
/** Default collision/render radius when a body omits `radius`. */
export const LIBRARY_DEFAULT_BODY_RADIUS = 8;
/** Default offscreen bake diameter for radial-elevation prop sprites. */
const LIBRARY_DEFAULT_BAKE_PIXEL_SIZE = 32;
/**
 * @param {{ _baseRadius?: number, radius?: number } | null | undefined} body
 * @param {number} [fallback]
 */
export function resolveBodyRadius(body, fallback = LIBRARY_DEFAULT_BODY_RADIUS) {
    if (!body) return fallback;
    const shape = body.shape;
    if (shape && shape.shapeTypeId === SHAPE_TYPE_CIRCLE) return shape.radius;
    return body._baseRadius ?? body.radius ?? fallback;
}
export const P_VEC_A = ENGINE_PHYS_BASE;
export const P_VEC_B = ENGINE_PHYS_BASE + 2;
export const P_VEC_C = ENGINE_PHYS_BASE + 4;
export const P_VEC_D = ENGINE_PHYS_BASE + 6;
export const P_AABB_A = ENGINE_PHYS_BASE + 8;
export const P_OUT_MASS_AREA = ENGINE_PHYS_BASE + 16;
export const P_OUT_MASS_CX = ENGINE_PHYS_BASE + 17;
export const P_OUT_MASS_CY = ENGINE_PHYS_BASE + 18;
export const P_OUT_MASS_INERTIA = ENGINE_PHYS_BASE + 19;
export const P_OUT_RAY_ENTER = ENGINE_PHYS_BASE + 20;
export const P_OUT_RAY_EXIT = ENGINE_PHYS_BASE + 21;
export const P_OUT_RAY_NX = ENGINE_PHYS_BASE + 22;
export const P_OUT_RAY_NY = ENGINE_PHYS_BASE + 23;
export const P_OUT_PEN_NX = ENGINE_PHYS_BASE + 24;
export const P_OUT_PEN_NY = ENGINE_PHYS_BASE + 25;
export const P_OUT_PEN_OVERLAP = ENGINE_PHYS_BASE + 26;
export const P_OUT_PEN_DIST_SQ = ENGINE_PHYS_BASE + 27;
export const P_OUT_DIST_X = ENGINE_PHYS_BASE + 28;
export const P_OUT_DIST_Y = ENGINE_PHYS_BASE + 29;
export const P_OUT_DIST_T = ENGINE_PHYS_BASE + 30;
export const P_OUT_DIST_DIST = ENGINE_PHYS_BASE + 31;
export const P_OUT_SOLVE_ITERS = ENGINE_PHYS_BASE + 32;
export const P_OUT_SOLVE_IMPULSE = ENGINE_PHYS_BASE + 33;
export const P_OUT_SOLVE_REST = ENGINE_PHYS_BASE + 34;
export const P_OUT_WALL_X = ENGINE_PHYS_BASE + 35;
export const P_OUT_WALL_Y = ENGINE_PHYS_BASE + 36;
export const P_OUT_WALL_Z = ENGINE_PHYS_BASE + 37;
export const P_OUT_WALL_IDX = ENGINE_PHYS_BASE + 38;
export const P_OUT_SWEEP_T = ENGINE_PHYS_BASE + 39;
export const P_OUT_SWEEP_X = ENGINE_PHYS_BASE + 40;
export const P_OUT_SWEEP_Y = ENGINE_PHYS_BASE + 41;
export const P_SAT = ENGINE_PHYS_BASE + 42;
export const P_SAT_BEST = ENGINE_PHYS_BASE + 67;
export const P_CLIP_X = ENGINE_PHYS_BASE + 92;
export const P_CLIP_Y = ENGINE_PHYS_BASE + 96;
export const P_PROJ_A = ENGINE_PHYS_BASE + 100;
export const P_PROJ_B = ENGINE_PHYS_BASE + 102;
/**
 * Library baseline — games override via `gameDefinition.collisionSettings`, project via Config.
 */
/** @typedef {typeof LIBRARY_COLLISION_DEFAULTS} LibraryCollisionSettings */
export const LIBRARY_COLLISION_DEFAULTS = {
    kineticIterations: 4,
    /** Peak travel per physics substep (px) — see Libraries/Motion/motionSubsteps.js */
    motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 },
    /** Shared still/moving thresholds for sleep, contact resolve, and wall queries. */
    kineticActivity: { movingSpeedSq: 0.25, rotatingSpeedRad: 0.1, neighborQueryPad: { minPad: 2, padScale: 0.5, maxPad: 15 } },
    kineticSleep: { frames: 30 },
    restitution: { rigidBody: 0.15, kineticPair: 0.4 },
    /** Coulomb pair friction when strategy has no pairFriction / wallPhysics.friction. */
    pairFriction: 0.35,
    /** Prior-frame normal/tangent impulse decay for kinetic contact warm-start. */
    kineticWarmStartDecay: 0.8,
    /** Area-based kinetic mass: mass = density × collision footprint area. */
    material: { densityDefault: 1.5 / 256, minMass: 0.01 },
    /** Post-contact distance joints — separate from kinetic pair stream. */
    kineticConstraints: { iterations: 4, velocityBias: 0.2 },
    /** Stop outer kinetic iterations when constraints + velocities settle. */
    kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactImpulseEpsilon: 0.05 },
    /** Resting contacts skip re-solve iterations after warm-start. */
    kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 },
};
export const collisionSettings = structuredClone(LIBRARY_COLLISION_DEFAULTS);
function polygonShapeArea(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 6) return 0;
    return Math.abs(polygonSignedArea2D(verts));
}
function polygonShapeInertiaFactor(shape) {
    const verts = shape.vertices;
    if (!verts || verts.length < 6) return 0;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return 0;
    return polygonSecondMomentAboutCentroid2D(verts) / area;
}
function collisionPartMassProperties(shape) {
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
        const r = shape.radius;
        const area = Math.PI * r * r;
        ENGINE_F32[P_OUT_MASS_AREA] = area;
        ENGINE_F32[P_OUT_MASS_CX] = 0;
        ENGINE_F32[P_OUT_MASS_CY] = 0;
        ENGINE_F32[P_OUT_MASS_INERTIA] = (r * r) / 2;
        return;
    }
    const verts = shape.vertices;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) {
        ENGINE_F32[P_OUT_MASS_AREA] = 0;
        ENGINE_F32[P_OUT_MASS_CX] = 0;
        ENGINE_F32[P_OUT_MASS_CY] = 0;
        ENGINE_F32[P_OUT_MASS_INERTIA] = 0;
        return;
    }
    polygonCentroid2DInto(ENGINE_F32, M_OUT_CX, verts);
    ENGINE_F32[P_OUT_MASS_AREA] = area;
    ENGINE_F32[P_OUT_MASS_CX] = ENGINE_F32[M_OUT_CX];
    ENGINE_F32[P_OUT_MASS_CY] = ENGINE_F32[M_OUT_CY];
    ENGINE_F32[P_OUT_MASS_INERTIA] = polygonSecondMomentAboutCentroid2D(verts) / area;
}
function compoundInertiaFactor(parts) {
    if (parts.length === 1) {
        collisionPartMassProperties(parts[0]);
        return ENGINE_F32[P_OUT_MASS_INERTIA];
    }
    const count = parts.length;
    if (count * 4 > 256) throw new Error(`compoundInertiaFactor: parts count ${count} exceeds scratch size`);
    let totalArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i++) {
        collisionPartMassProperties(parts[i]);
        const area = ENGINE_F32[P_OUT_MASS_AREA];
        const px = ENGINE_F32[P_OUT_MASS_CX];
        const py = ENGINE_F32[P_OUT_MASS_CY];
        const inertiaPerArea = ENGINE_F32[P_OUT_MASS_INERTIA];
        const offset = P_COMPOUND + i * 4;
        ENGINE_F32[offset] = area;
        ENGINE_F32[offset + 1] = px;
        ENGINE_F32[offset + 2] = py;
        ENGINE_F32[offset + 3] = inertiaPerArea;
        totalArea += area;
        cx += px * area;
        cy += py * area;
    }
    cx /= totalArea;
    cy /= totalArea;
    let inertia = 0;
    for (let i = 0; i < count; i++) {
        const offset = P_COMPOUND + i * 4;
        const area = ENGINE_F32[offset];
        const px = ENGINE_F32[offset + 1];
        const py = ENGINE_F32[offset + 2];
        const inertiaPerArea = ENGINE_F32[offset + 3];
        const Icm = inertiaPerArea * area;
        const dx = px - cx;
        const dy = py - cy;
        inertia += Icm + area * (dx * dx + dy * dy);
    }
    return inertia / totalArea;
}
export function kineticFootprintArea(body) {
    if (body.footprintArea != null) return body.footprintArea;
    const parts = body.collisionParts;
    if (parts?.length > 1) {
        let area = 0;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.shapeTypeId === SHAPE_TYPE_POLYGON) area += polygonShapeArea(part);
            else if (part.shapeTypeId === SHAPE_TYPE_CIRCLE) area += Math.PI * part.radius * part.radius;
        }
        return area;
    }
    const shape = body.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) return polygonShapeArea(shape);
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) return Math.PI * shape.radius * shape.radius;
    throw new Error(`kineticFootprintArea: unknown shapeTypeId ${shape?.shapeTypeId}`);
}
export function kineticDensity(body) {
    return body.strategy?.density ?? collisionSettings.material.densityDefault;
}
export function kineticMassFromFootprint(body) {
    const minMass = collisionSettings.material.minMass;
    return Math.max(minMass, kineticDensity(body) * kineticFootprintArea(body));
}
export function kineticInertiaFromBody(body) {
    const m = massFromBody(body);
    const parts = body.collisionParts;
    if (parts?.length > 1) return m * compoundInertiaFactor(parts);
    const shape = body.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        const inertiaFactor = polygonShapeInertiaFactor(shape);
        return m * inertiaFactor;
    }
    if (shape.shapeTypeId !== SHAPE_TYPE_CIRCLE) throw new Error(`kineticInertiaFromBody: unknown shapeTypeId ${shape?.shapeTypeId}`);
    const r = shape.radius;
    return (m * r * r) / 2;
}
function massFromBody(body) {
    if (body.mass == null) throw new Error("Kinetic body missing mass");
    return body.mass;
}
export function normalizeKineticBody(body) {
    const strategy = body.strategy;
    if (!strategy || strategy.isKinetic !== true) throw new Error("normalizeKineticBody requires a kinetic body");
    if (body.vx === undefined) body.vx = 0;
    if (body.vy === undefined) body.vy = 0;
    if (body.angularVelocity === undefined) body.angularVelocity = 0;
    if (body.mass == null) body.mass = kineticMassFromFootprint(body);
    const physId = body._physId;
    if (physId === undefined || physId === -1) return body;
    const moment = body.momentOfInertia;
    const slab = kineticStaticSlab;
    slab.mass[physId] = body.mass;
    slab.invMass[physId] = 1 / body.mass;
    slab.invI[physId] = moment ? 1 / moment : 0;
    slab.entityId[physId] = body.id ?? -1;
    slab.restitution[physId] = strategy.pairRestitution ?? -1;
    slab.friction[physId] = strategy.pairFriction ?? (strategy.wallPhysics ? strategy.wallPhysics.friction : -1);
    return body;
}
function intervalsSeparatedObbObbSlab(ax, ay, physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    const aCos = slab.cos[physIdA];
    const aSin = slab.sin[physIdA];
    const bCos = slab.cos[physIdB];
    const bSin = slab.sin[physIdB];
    const ca = slab.x[physIdA] * ax + slab.y[physIdA] * ay;
    const ra = slab.hx[physIdA] * Math.abs(aCos * ax + aSin * ay) + slab.hy[physIdA] * Math.abs(-aSin * ax + aCos * ay);
    const cb = slab.x[physIdB] * ax + slab.y[physIdB] * ay;
    const rb = slab.hx[physIdB] * Math.abs(bCos * ax + bSin * ay) + slab.hy[physIdB] * Math.abs(-bSin * ax + bCos * ay);
    return Math.abs(ca - cb) > ra + rb;
}
function obbObbOverlapSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    if (intervalsSeparatedObbObbSlab(slab.cos[physIdA], slab.sin[physIdA], physIdA, physIdB)) return false;
    if (intervalsSeparatedObbObbSlab(-slab.sin[physIdA], slab.cos[physIdA], physIdA, physIdB)) return false;
    if (intervalsSeparatedObbObbSlab(slab.cos[physIdB], slab.sin[physIdB], physIdA, physIdB)) return false;
    if (intervalsSeparatedObbObbSlab(-slab.sin[physIdB], slab.cos[physIdB], physIdA, physIdB)) return false;
    return true;
}
function intervalsSeparatedCircleObbSlab(ax, ay, physIdCircle, physIdObb) {
    const slab = kineticDynamicSlab;
    const cc = slab.x[physIdCircle] * ax + slab.y[physIdCircle] * ay;
    const rc = slab.r[physIdCircle];
    const obbCos = slab.cos[physIdObb];
    const obbSin = slab.sin[physIdObb];
    const cb = slab.x[physIdObb] * ax + slab.y[physIdObb] * ay;
    const rb = slab.hx[physIdObb] * Math.abs(obbCos * ax + obbSin * ay) + slab.hy[physIdObb] * Math.abs(-obbSin * ax + obbCos * ay);
    return Math.abs(cc - cb) > rc + rb;
}
function circleObbOverlapSlab(physIdCircle, physIdObb) {
    const slab = kineticDynamicSlab;
    const obbCos = slab.cos[physIdObb];
    const obbSin = slab.sin[physIdObb];
    if (intervalsSeparatedCircleObbSlab(obbCos, obbSin, physIdCircle, physIdObb)) return false;
    if (intervalsSeparatedCircleObbSlab(-obbSin, obbCos, physIdCircle, physIdObb)) return false;
    const dx = slab.x[physIdCircle] - slab.x[physIdObb];
    const dy = slab.y[physIdCircle] - slab.y[physIdObb];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1e-6) if (intervalsSeparatedCircleObbSlab(dx / len, dy / len, physIdCircle, physIdObb)) return false;
    return true;
}
export function pairBroadphaseOverlapSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    const kindA = slab.shapeKind[physIdA];
    const kindB = slab.shapeKind[physIdB];
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_CIRCLE) return pairCircleCircleOverlapSlab(physIdA, physIdB);
    if (kindA === SHAPE_TYPE_CIRCLE) return circleObbOverlapSlab(physIdA, physIdB);
    if (kindB === SHAPE_TYPE_CIRCLE) return circleObbOverlapSlab(physIdB, physIdA);
    return obbObbOverlapSlab(physIdA, physIdB);
}
export function stampKineticBodyFromEntity(physId, entity) {
    const slab = kineticDynamicSlab;
    const angle = entityFacing(entity);
    const compound = entity.collisionParts;
    const dirty = entity._broadphaseDirty === true;
    if (compound?.length > 1) {
        if (!dirty && slab.partCount[physId] === compound.length && slab.shapeKind[physId] === 0 && slab.partGeomOffset[physId] >= 0) {
            slab.cos[physId] = Math.cos(angle);
            slab.sin[physId] = Math.sin(angle);
            return;
        }
        slab.partCount[physId] = compound.length;
        slab.shapeKind[physId] = 0;
        computeCompoundLocalBoundsF32(ENGINE_F32, P_AABB_A, compound);
        slab.hx[physId] = (ENGINE_F32[P_AABB_A + 2] - ENGINE_F32[P_AABB_A]) * 0.5;
        slab.hy[physId] = (ENGINE_F32[P_AABB_A + 3] - ENGINE_F32[P_AABB_A + 1]) * 0.5;
        slab.cos[physId] = Math.cos(angle);
        slab.sin[physId] = Math.sin(angle);
        stampShapeGeomParts(physId, compound);
        entity._broadphaseDirty = false;
        return;
    }
    slab.partCount[physId] = 1;
    const shape = entity.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
        if (!dirty && slab.shapeKind[physId] === SHAPE_TYPE_CIRCLE && slab.partGeomOffset[physId] >= 0 && slab.r[physId] === shape.radius) return;
        slab.shapeKind[physId] = SHAPE_TYPE_CIRCLE;
        slab.r[physId] = shape.radius;
        stampShapeGeomCircle(physId, shape.radius);
        entity._broadphaseDirty = false;
        return;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        if (!dirty && slab.shapeKind[physId] === SHAPE_TYPE_POLYGON && slab.partGeomOffset[physId] >= 0) {
            slab.cos[physId] = Math.cos(angle);
            slab.sin[physId] = Math.sin(angle);
            return;
        }
        slab.shapeKind[physId] = SHAPE_TYPE_POLYGON;
        convexFootprintHalfExtents(ENGINE_F32, P_VEC_A, shape.vertices);
        slab.hx[physId] = ENGINE_F32[P_VEC_A];
        slab.hy[physId] = ENGINE_F32[P_VEC_A + 1];
        slab.cos[physId] = Math.cos(angle);
        slab.sin[physId] = Math.sin(angle);
        stampShapeGeomPolygon(physId, shape.vertices, shape.normals);
        entity._broadphaseDirty = false;
        return;
    }
    throw new Error(`stampKineticBodyFromEntity: unknown shapeTypeId ${shape?.shapeTypeId}`);
}
function ensurePartTableCapacity(needed) {
    const slab = kineticDynamicSlab;
    ensureGrowU8(slab, "partShapeKind", needed, slab.partTableUsed);
    ensureGrowF32(slab, "partRadius", needed, slab.partTableUsed);
    ensureGrowI32(slab, "partVertOffset", needed, slab.partTableUsed);
    ensureGrowU16(slab, "partVertFloatCount", needed, slab.partTableUsed);
}
function ensureShapePoolCapacity(needed) {
    const slab = kineticDynamicSlab;
    ensureGrowF32(slab, "shapeVertPool", needed, slab.shapePoolUsed);
    ensureGrowF32(slab, "shapeNormPool", needed, slab.shapePoolUsed);
}
function allocPartRows(count) {
    const slab = kineticDynamicSlab;
    const start = slab.partTableUsed;
    ensurePartTableCapacity(start + count);
    slab.partTableUsed = start + count;
    return start;
}
function allocShapeFloats(floatCount) {
    if (floatCount > MAX_LIVE_POLYGON_FLOATS) throw new Error(`stampKineticBodyFromEntity: polygon floatCount ${floatCount} exceeds MAX_LIVE_POLYGON_FLOATS ${MAX_LIVE_POLYGON_FLOATS}`);
    const slab = kineticDynamicSlab;
    const start = slab.shapePoolUsed;
    ensureShapePoolCapacity(start + floatCount);
    slab.shapePoolUsed = start + floatCount;
    return start;
}
function copyShapeFloats(dstPool, dstOffset, src, floatCount) {
    for (let i = 0; i < floatCount; i++) dstPool[dstOffset + i] = src[i];
}
function stampShapeGeomCircle(physId, radius) {
    const slab = kineticDynamicSlab;
    const row = allocPartRows(1);
    slab.partGeomOffset[physId] = row;
    slab.partShapeKind[row] = SHAPE_TYPE_CIRCLE;
    slab.partRadius[row] = radius;
    slab.partVertOffset[row] = 0;
    slab.partVertFloatCount[row] = 0;
}
function stampShapeGeomPolygon(physId, vertices, normals) {
    const slab = kineticDynamicSlab;
    const floatCount = vertices.length;
    if ((floatCount & 1) !== 0) throw new Error(`stampShapeGeomPolygon: odd floatCount ${floatCount}`);
    const row = allocPartRows(1);
    const vo = allocShapeFloats(floatCount);
    copyShapeFloats(slab.shapeVertPool, vo, vertices, floatCount);
    copyShapeFloats(slab.shapeNormPool, vo, normals, floatCount);
    slab.partGeomOffset[physId] = row;
    slab.partShapeKind[row] = SHAPE_TYPE_POLYGON;
    slab.partRadius[row] = 0;
    slab.partVertOffset[row] = vo;
    slab.partVertFloatCount[row] = floatCount;
}
function stampShapeGeomParts(physId, parts) {
    const slab = kineticDynamicSlab;
    const row0 = allocPartRows(parts.length);
    slab.partGeomOffset[physId] = row0;
    for (let i = 0; i < parts.length; i++) {
        const shape = parts[i];
        const row = row0 + i;
        if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
            slab.partShapeKind[row] = SHAPE_TYPE_CIRCLE;
            slab.partRadius[row] = shape.radius;
            slab.partVertOffset[row] = 0;
            slab.partVertFloatCount[row] = 0;
            continue;
        }
        if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) throw new Error(`stampShapeGeomParts: unknown shapeTypeId ${shape?.shapeTypeId}`);
        const floatCount = shape.vertices.length;
        if ((floatCount & 1) !== 0) throw new Error(`stampShapeGeomParts: odd floatCount ${floatCount}`);
        const vo = allocShapeFloats(floatCount);
        copyShapeFloats(slab.shapeVertPool, vo, shape.vertices, floatCount);
        copyShapeFloats(slab.shapeNormPool, vo, shape.normals, floatCount);
        slab.partShapeKind[row] = SHAPE_TYPE_POLYGON;
        slab.partRadius[row] = 0;
        slab.partVertOffset[row] = vo;
        slab.partVertFloatCount[row] = floatCount;
    }
}
export function writebackActiveKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) writebackEntitySlotPoseToRef(bodies[i]._physId, bodies[i]);
}
export function writeStaticKineticSlabSlot(body) {
    normalizeKineticBody(body);
}
export function clearActiveKineticBodySlab() {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < slab.activePhysCount; i++) slab.activeSlot[slab.activePhysIds[i]] = -1;
    slab.activePhysCount = 0;
}
export function invalidateKineticSlabSlot(physId) {
    const dyn = kineticDynamicSlab;
    dyn.x[physId] = 0;
    dyn.y[physId] = 0;
    dyn.vx[physId] = 0;
    dyn.vy[physId] = 0;
    dyn.w[physId] = 0;
    dyn.cos[physId] = 1;
    dyn.sin[physId] = 0;
    dyn.partCount[physId] = 0;
    dyn.shapeKind[physId] = 0;
    dyn.r[physId] = 0;
    dyn.hx[physId] = 0;
    dyn.hy[physId] = 0;
    dyn.activeSlot[physId] = -1;
    dyn.islandRoot[physId] = -1;
    dyn.linkNeighborOffset[physId] = 0;
    dyn.linkNeighborCount[physId] = 0;
    dyn.spatialNeighborOffset[physId] = 0;
    dyn.spatialNeighborCount[physId] = 0;
    dyn.partGeomOffset[physId] = -1;
    entityRollQw[physId] = 1;
    entityRollQx[physId] = 0;
    entityRollQy[physId] = 0;
    entityRollQz[physId] = 0;
    const stat = kineticStaticSlab;
    stat.mass[physId] = 0;
    stat.invMass[physId] = 0;
    stat.invI[physId] = 0;
    stat.entityId[physId] = -1;
    stat.restitution[physId] = 0;
    stat.friction[physId] = 0;
}
export function appendActiveKineticBodySlabPhysId(physId) {
    const slab = kineticDynamicSlab;
    slab.activeSlot[physId] = slab.activePhysCount;
    slab.activePhysIds[slab.activePhysCount++] = physId;
}
export function clampActiveKineticBodySlabSpeed(maxSpeed) {
    const slab = kineticDynamicSlab;
    const maxSpeedSq = maxSpeed * maxSpeed;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physId = slab.activePhysIds[i];
        const vx = slab.vx[physId];
        const vy = slab.vy[physId];
        const speedSq = vx * vx + vy * vy;
        if (speedSq <= maxSpeedSq) continue;
        const speed = Math.sqrt(speedSq);
        slab.vx[physId] = (vx / speed) * maxSpeed;
        slab.vy[physId] = (vy / speed) * maxSpeed;
    }
}
export function pairCircleCircleOverlapSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    const dx = slab.x[physIdA] - slab.x[physIdB];
    const dy = slab.y[physIdA] - slab.y[physIdB];
    const radii = slab.r[physIdA] + slab.r[physIdB];
    return dx * dx + dy * dy < radii * radii;
}
export class Shape {
    constructor() {
        this.shapeTypeId = 0;
    }
    getBoundingRadius() {
        return 0;
    }
}
export class CircleShape extends Shape {
    constructor(radius) {
        super();
        this.shapeTypeId = SHAPE_TYPE_CIRCLE;
        this.radius = radius;
    }
    getBoundingRadius() {
        return this.radius;
    }
}
export class PolygonShape extends Shape {
    constructor(vertices) {
        super();
        this.shapeTypeId = SHAPE_TYPE_POLYGON;
        let verts = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
        const count = verts.length / 2;
        if (count >= 3) {
            const clean = [];
            let lastX = NaN;
            let lastY = NaN;
            for (let i = 0; i < count; i++) {
                const x = verts[i * 2];
                const y = verts[i * 2 + 1];
                if (i > 0) {
                    const dx = x - lastX;
                    const dy = y - lastY;
                    if (dx * dx + dy * dy < 1e-8) continue;
                }
                clean.push(x, y);
                lastX = x;
                lastY = y;
            }
            if (clean.length >= 6) {
                const dx = clean[clean.length - 2] - clean[0];
                const dy = clean[clean.length - 1] - clean[1];
                if (dx * dx + dy * dy < 1e-8) {
                    clean.pop();
                    clean.pop();
                }
            }
            if (clean.length !== verts.length) verts = new Float32Array(clean);
        }
        if (polygonSignedArea2D(verts) < 0) verts = reversePolygonWinding(verts);
        this._vertCap = verts instanceof Float32Array ? verts : new Float32Array(verts);
        this.vertices = this._vertCap;
        this.normals = this._computeNormals();
        this._normCap = this.normals;
        this.boundingRadius = this._computeBoundingRadius();
    }
    ensureVertCapacity(floatCount) {
        if (!(this._vertCap instanceof Float32Array) || this._vertCap.length < floatCount) {
            const next = new Float32Array(floatCount);
            const old = this.vertices;
            const oldLen = old?.length ?? 0;
            for (let i = 0; i < oldLen; i++) next[i] = old[i];
            this._vertCap = next;
            this.vertices = oldLen > 0 ? next.subarray(0, oldLen) : next.subarray(0, Math.min(8, floatCount));
        }
        if (!(this._normCap instanceof Float32Array) || this._normCap.length < floatCount) {
            this._normCap = new Float32Array(floatCount);
            if (this.vertices.length >= 6) {
                this._fillNormals(this._normCap, this.vertices.length / 2);
                this.normals = this._normCap.subarray(0, this.vertices.length);
            } else this.normals = this._normCap.subarray(0, Math.min(8, floatCount));
        }
    }
    setFlatVerts(src, floatCount) {
        const cap = this._vertCap;
        if (!(cap instanceof Float32Array)) throw new Error("PolygonShape.setFlatVerts missing _vertCap");
        if (cap.length < floatCount) throw new Error(`PolygonShape.setFlatVerts capacity ${cap.length} < ${floatCount}`);
        for (let i = 0; i < floatCount; i++) cap[i] = src[i];
        this.vertices = floatCount === cap.length ? cap : cap.subarray(0, floatCount);
        if (floatCount >= 6 && polygonSignedArea2D(this.vertices) < 0) {
            const verts = this.vertices;
            for (let i = 0, j = floatCount - 2; i < j; i += 2, j -= 2) {
                const x = verts[i];
                const y = verts[i + 1];
                verts[i] = verts[j];
                verts[i + 1] = verts[j + 1];
                verts[j] = x;
                verts[j + 1] = y;
            }
        }
        this._rebuildNormalsInPlace();
        this.boundingRadius = this._computeBoundingRadius();
    }
    getBoundingRadius() {
        return this.boundingRadius;
    }
    _computeBoundingRadius() {
        let maxSq = 0;
        const count = this.vertices.length;
        for (let i = 0; i < count; i += 2) {
            const x = this.vertices[i];
            const y = this.vertices[i + 1];
            const sq = x * x + y * y;
            if (sq > maxSq) maxSq = sq;
        }
        return Math.sqrt(maxSq);
    }
    _computeNormals() {
        const count = this.vertices.length / 2;
        const normals = new Float32Array(count * 2);
        this._fillNormals(normals, count);
        return normals;
    }
    _rebuildNormalsInPlace() {
        const floatCount = this.vertices.length;
        const count = floatCount / 2;
        let cap = this._normCap;
        if (!(cap instanceof Float32Array) || cap.length < floatCount) throw new Error(`PolygonShape normals capacity ${cap?.length ?? 0} < ${floatCount}`);
        this._fillNormals(cap, count);
        this.normals = floatCount === cap.length ? cap : cap.subarray(0, floatCount);
    }
    _fillNormals(normals, count) {
        for (let i = 0; i < count; i++) {
            const p1x = this.vertices[i * 2];
            const p1y = this.vertices[i * 2 + 1];
            const nextIdx = ((i + 1) % count) * 2;
            const p2x = this.vertices[nextIdx];
            const p2y = this.vertices[nextIdx + 1];
            const dx = p2x - p1x;
            const dy = p2y - p1y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                normals[i * 2] = -dy / len;
                normals[i * 2 + 1] = dx / len;
            } else {
                normals[i * 2] = 0;
                normals[i * 2 + 1] = 0;
            }
        }
    }
}
const LIVE_GEOM_VERT_BUCKETS = [8, 16, 32, 64, 128, 256, 512];
export const MAX_LIVE_POLYGON_FLOATS = LIVE_GEOM_VERT_BUCKETS[LIVE_GEOM_VERT_BUCKETS.length - 1] * 2;
const liveGeomFreeByBucket = LIVE_GEOM_VERT_BUCKETS.map(() => []);
function liveGeomBucketIndex(vertCount) {
    for (let i = 0; i < LIVE_GEOM_VERT_BUCKETS.length; i++) if (LIVE_GEOM_VERT_BUCKETS[i] >= vertCount) return i;
    return LIVE_GEOM_VERT_BUCKETS.length - 1;
}
function allocLiveGeomSpan(floatCount) {
    if (floatCount < 6) throw new Error(`allocLiveGeomSpan requires >= 6 floats, got ${floatCount}`);
    if (floatCount > MAX_LIVE_POLYGON_FLOATS) throw new Error(`allocLiveGeomSpan ${floatCount} exceeds MAX_LIVE_POLYGON_FLOATS`);
    const bucket = liveGeomBucketIndex((floatCount + 1) >> 1);
    const free = liveGeomFreeByBucket[bucket];
    if (free.length) return free.pop();
    const cap = LIVE_GEOM_VERT_BUCKETS[bucket] * 2;
    return { verts: new Float32Array(cap), normals: new Float32Array(cap), cap, bucket };
}
function releaseLiveGeomSpan(span) {
    liveGeomFreeByBucket[span.bucket].push(span);
}
export class LivePolygonShape extends Shape {
    constructor() {
        super();
        this.shapeTypeId = SHAPE_TYPE_POLYGON;
        this.vertices = null;
        this.normals = null;
        this.boundingRadius = 0;
    }
    getBoundingRadius() {
        return this.boundingRadius;
    }
}
function rebuildLivePolygonNormals(verts, normals, floatCount) {
    const count = floatCount / 2;
    for (let i = 0; i < count; i++) {
        const p1x = verts[i * 2];
        const p1y = verts[i * 2 + 1];
        const nextIdx = ((i + 1) % count) * 2;
        const p2x = verts[nextIdx];
        const p2y = verts[nextIdx + 1];
        const dx = p2x - p1x;
        const dy = p2y - p1y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            normals[i * 2] = -dy / len;
            normals[i * 2 + 1] = dx / len;
        } else {
            normals[i * 2] = 0;
            normals[i * 2 + 1] = 0;
        }
    }
}
function livePolygonBoundingRadius(verts, floatCount) {
    let maxSq = 0;
    for (let i = 0; i < floatCount; i += 2) {
        const x = verts[i];
        const y = verts[i + 1];
        const sq = x * x + y * y;
        if (sq > maxSq) maxSq = sq;
    }
    return Math.sqrt(maxSq);
}
export function releaseLivePolygon(body) {
    const span = body._liveGeom;
    if (!span) return;
    releaseLiveGeomSpan(span);
    body._liveGeom = null;
    if (body.shape instanceof LivePolygonShape) {
        body.shape.vertices = null;
        body.shape.normals = null;
        body.shape.boundingRadius = 0;
    }
}
export function writeLivePolygon(body, src, floatCount) {
    if (floatCount < 6 || (floatCount & 1) !== 0) throw new Error(`writeLivePolygon requires even floatCount >= 6, got ${floatCount}`);
    let span = body._liveGeom;
    if (!span || span.cap < floatCount) {
        if (span) releaseLiveGeomSpan(span);
        span = allocLiveGeomSpan(floatCount);
        body._liveGeom = span;
    }
    const verts = span.verts;
    for (let i = 0; i < floatCount; i++) verts[i] = src[i];
    const view = floatCount === span.cap ? verts : verts.subarray(0, floatCount);
    if (polygonSignedArea2D(view) < 0)
        for (let i = 0, j = floatCount - 2; i < j; i += 2, j -= 2) {
            const x = verts[i];
            const y = verts[i + 1];
            verts[i] = verts[j];
            verts[i + 1] = verts[j + 1];
            verts[j] = x;
            verts[j + 1] = y;
        }
    rebuildLivePolygonNormals(verts, span.normals, floatCount);
    let shape = body.shape;
    if (!(shape instanceof LivePolygonShape)) {
        shape = new LivePolygonShape();
        body.shape = shape;
    }
    shape.vertices = floatCount === span.cap ? span.verts : span.verts.subarray(0, floatCount);
    shape.normals = floatCount === span.cap ? span.normals : span.normals.subarray(0, floatCount);
    shape.boundingRadius = livePolygonBoundingRadius(verts, floatCount);
    body.radius = shape.boundingRadius;
    if (body._physId !== undefined) {
        body._broadphaseDirty = true;
        stampKineticBodyFromEntity(body._physId, body);
    }
    return shape;
}
export function ensureLivePolygonCapacity(body, floatCount) {
    const span = body._liveGeom;
    if (span && span.cap >= floatCount && body.shape instanceof LivePolygonShape) return;
    const scratch = span && body.shape?.vertices ? body.shape.vertices : null;
    const prevN = scratch?.length ?? 0;
    const tmp = prevN > 0 ? new Float32Array(Math.max(prevN, floatCount)) : null;
    if (tmp && scratch) for (let i = 0; i < prevN; i++) tmp[i] = scratch[i];
    if (span) releaseLiveGeomSpan(span);
    const next = allocLiveGeomSpan(Math.max(floatCount, 8));
    body._liveGeom = next;
    if (tmp) for (let i = 0; i < prevN; i++) next.verts[i] = tmp[i];
    let shape = body.shape;
    if (!(shape instanceof LivePolygonShape)) {
        shape = new LivePolygonShape();
        body.shape = shape;
    }
    const n = prevN >= 6 ? prevN : 0;
    if (n >= 6) {
        rebuildLivePolygonNormals(next.verts, next.normals, n);
        shape.vertices = next.verts.subarray(0, n);
        shape.normals = next.normals.subarray(0, n);
        shape.boundingRadius = livePolygonBoundingRadius(next.verts, n);
        body.radius = shape.boundingRadius;
    } else {
        shape.vertices = next.verts.subarray(0, Math.min(8, next.cap));
        shape.normals = next.normals.subarray(0, Math.min(8, next.cap));
        shape.boundingRadius = 0;
    }
}
const MANIFOLD_MAX_POINTS = 2;
export const SAT_RESULT = ENGINE_F32.subarray(P_SAT, P_SAT + 25);
const SAT_BEST_RESULT = ENGINE_F32.subarray(P_SAT_BEST, P_SAT_BEST + 25);
const clipX = ENGINE_F32.subarray(P_CLIP_X, P_CLIP_X + 4);
const clipY = ENGINE_F32.subarray(P_CLIP_Y, P_CLIP_Y + 4);
const PROJ_A = ENGINE_F32.subarray(P_PROJ_A, P_PROJ_A + 2);
const PROJ_B = ENGINE_F32.subarray(P_PROJ_B, P_PROJ_B + 2);
function findEdgeMostAligned(normals, no, floatCount, cos, sin, axisX, axisY, wantMax) {
    let bestDot = wantMax ? -Infinity : Infinity;
    let bestIndex = 0;
    for (let i = 0; i < floatCount; i += 2) {
        const nx = normals[no + i];
        const ny = normals[no + i + 1];
        const rx = nx * cos - ny * sin;
        const ry = nx * sin + ny * cos;
        const dot = rx * axisX + ry * axisY;
        if (wantMax ? dot > bestDot : dot < bestDot) {
            bestDot = dot;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
function clipSegmentToHalfPlane(x0, y0, x1, y1, nx, ny, offset, outX, outY, outStart) {
    let count = outStart;
    const d0 = x0 * nx + y0 * ny - offset;
    const d1 = x1 * nx + y1 * ny - offset;
    if (d0 <= 0) {
        outX[count] = x0;
        outY[count] = y0;
        count++;
    }
    if (d1 <= 0) {
        outX[count] = x1;
        outY[count] = y1;
        count++;
    }
    if (d0 * d1 < 0) {
        const t = d0 / (d0 - d1);
        outX[count] = x0 + t * (x1 - x0);
        outY[count] = y0 + t * (y1 - y0);
        count++;
    }
    return count;
}
function clipContactSegmentToHalfPlane(x0, y0, x1, y1, nx, ny, offset) {
    let clipCount = clipSegmentToHalfPlane(x0, y0, x1, y1, nx, ny, offset, clipX, clipY, 0);
    if (clipCount === 0) return 0;
    if (clipCount === 1) {
        clipX[1] = clipX[0];
        clipY[1] = clipY[0];
    }
    return clipCount === 1 ? 2 : clipCount;
}
function nearestIncidentVertexIndex(vertices, vo, floatCount, pxVal, pyVal, cos, sin, px, py) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    for (let i = 0; i < floatCount; i += 2) {
        const lx = vertices[vo + i];
        const ly = vertices[vo + i + 1];
        const vx = pxVal + lx * cos - ly * sin;
        const vy = pyVal + lx * sin + ly * cos;
        const dx = px - vx;
        const dy = py - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
const sVertMetaA = { verts: null, norms: null, vo: 0, n: 0 };
const sVertMetaB = { verts: null, norms: null, vo: 0, n: 0 };
function bindShapeVertMeta(out, shape) {
    out.verts = shape.vertices;
    out.norms = shape.normals;
    out.vo = shape._vertOffset || 0;
    out.n = shape._floatCount != null ? shape._floatCount : shape.vertices.length;
    return out;
}
function findExtremeVertexIndexAt(vertices, vo, floatCount, posX, posY, cos, sin, axisX, axisY, findMax) {
    let bestProj = findMax ? -Infinity : Infinity;
    let bestIndex = 0;
    for (let i = 0; i < floatCount; i += 2) {
        const lx = vertices[vo + i];
        const ly = vertices[vo + i + 1];
        const vx = posX + lx * cos - ly * sin;
        const vy = posY + lx * sin + ly * cos;
        const proj = vx * axisX + vy * axisY;
        if (findMax ? proj > bestProj : proj < bestProj) {
            bestProj = proj;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
function findClosestWorldVertexIndexAt(vertices, vo, floatCount, posX, posY, cos, sin, targetX, targetY) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    for (let i = 0; i < floatCount; i += 2) {
        const lx = vertices[vo + i];
        const ly = vertices[vo + i + 1];
        const vx = posX + lx * cos - ly * sin;
        const vy = posY + lx * sin + ly * cos;
        const dx = targetX - vx;
        const dy = targetY - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
function buildPolyPolyContactManifoldF32(xA, yA, cosA, sinA, vertsA, normsA, voA, nA, xB, yB, cosB, sinB, vertsB, normsB, voB, nB, nx, ny, refPolyIsA, refEdgeIndex) {
    const refX = refPolyIsA ? xA : xB;
    const refY = refPolyIsA ? yA : yB;
    const incX = refPolyIsA ? xB : xA;
    const incY = refPolyIsA ? yB : yA;
    const refCos = refPolyIsA ? cosA : cosB;
    const refSin = refPolyIsA ? sinA : sinB;
    const incCos = refPolyIsA ? cosB : cosA;
    const incSin = refPolyIsA ? sinB : sinA;
    const refVerts = refPolyIsA ? vertsA : vertsB;
    const refNorms = refPolyIsA ? normsA : normsB;
    const refVo = refPolyIsA ? voA : voB;
    const refN = refPolyIsA ? nA : nB;
    const incVerts = refPolyIsA ? vertsB : vertsA;
    const incVo = refPolyIsA ? voB : voA;
    const incN = refPolyIsA ? nB : nA;
    const incNorms = refPolyIsA ? normsB : normsA;
    const refFaceNx = refPolyIsA ? nx : -nx;
    const refFaceNy = refPolyIsA ? ny : -ny;
    const refCount = refN / 2;
    const refEdgeNext = (refEdgeIndex + 1) % refCount;
    const sideEdgeA = (refEdgeIndex + refCount - 1) % refCount;
    const sideEdgeB = refEdgeNext;
    const edgeAx = refX + refVerts[refVo + refEdgeIndex * 2] * refCos - refVerts[refVo + refEdgeIndex * 2 + 1] * refSin;
    const edgeAy = refY + refVerts[refVo + refEdgeIndex * 2] * refSin + refVerts[refVo + refEdgeIndex * 2 + 1] * refCos;
    const edgeBx = refX + refVerts[refVo + refEdgeNext * 2] * refCos - refVerts[refVo + refEdgeNext * 2 + 1] * refSin;
    const edgeBy = refY + refVerts[refVo + refEdgeNext * 2] * refSin + refVerts[refVo + refEdgeNext * 2 + 1] * refCos;
    const sideANx = -(refNorms[refVo + sideEdgeA * 2] * refCos - refNorms[refVo + sideEdgeA * 2 + 1] * refSin);
    const sideANy = -(refNorms[refVo + sideEdgeA * 2] * refSin + refNorms[refVo + sideEdgeA * 2 + 1] * refCos);
    const sideAOffset = sideANx * edgeAx + sideANy * edgeAy;
    const sideBNx = -(refNorms[refVo + sideEdgeB * 2] * refCos - refNorms[refVo + sideEdgeB * 2 + 1] * refSin);
    const sideBNy = -(refNorms[refVo + sideEdgeB * 2] * refSin + refNorms[refVo + sideEdgeB * 2 + 1] * refCos);
    const sideBOffset = sideBNx * edgeBx + sideBNy * edgeBy;
    const incidentEdge = findEdgeMostAligned(incNorms, incVo, incN, incCos, incSin, refFaceNx, refFaceNy, true);
    const incCount = incN / 2;
    const incEdgeNext = (incidentEdge + 1) % incCount;
    const incX0 = incX + incVerts[incVo + incidentEdge * 2] * incCos - incVerts[incVo + incidentEdge * 2 + 1] * incSin;
    const incY0 = incY + incVerts[incVo + incidentEdge * 2] * incSin + incVerts[incVo + incidentEdge * 2 + 1] * incCos;
    const incX1 = incX + incVerts[incVo + incEdgeNext * 2] * incCos - incVerts[incVo + incEdgeNext * 2 + 1] * incSin;
    const incY1 = incY + incVerts[incVo + incEdgeNext * 2] * incSin + incVerts[incVo + incEdgeNext * 2 + 1] * incCos;
    let clipCount = clipContactSegmentToHalfPlane(incX0, incY0, incX1, incY1, sideANx, sideANy, sideAOffset);
    if (clipCount === 0) return null;
    clipCount = clipContactSegmentToHalfPlane(clipX[0], clipY[0], clipX[1], clipY[1], sideBNx, sideBNy, sideBOffset);
    if (clipCount === 0) return null;
    const frontOffset = refFaceNx * edgeAx + refFaceNy * edgeAy;
    clipCount = clipContactSegmentToHalfPlane(clipX[0], clipY[0], clipX[1], clipY[1], refFaceNx, refFaceNy, frontOffset);
    if (clipCount === 0) return null;
    let pointCount = 0;
    for (let i = 0; i < clipCount && pointCount < MANIFOLD_MAX_POINTS; i++) {
        const px = clipX[i];
        const py = clipY[i];
        if (i > 0 && Math.hypot(px - clipX[i - 1], py - clipY[i - 1]) <= 1e-6) continue;
        const incFeature = nearestIncidentVertexIndex(incVerts, incVo, incN, incX, incY, incCos, incSin, px, py);
        const refFeature = nearestIncidentVertexIndex(refVerts, refVo, refN, refX, refY, refCos, refSin, px, py);
        const write = 9 + pointCount * 4;
        SAT_RESULT[write + 0] = px;
        SAT_RESULT[write + 1] = py;
        if (refPolyIsA) {
            SAT_RESULT[write + 2] = refFeature;
            SAT_RESULT[write + 3] = incFeature;
        } else {
            SAT_RESULT[write + 2] = incFeature;
            SAT_RESULT[write + 3] = refFeature;
        }
        pointCount++;
    }
    if (pointCount === 0) return null;
    return pointCount;
}
export function entityFacing(entity) {
    if (entity == null) return 0;
    return entity.facing ?? entity.angle ?? 0;
}
const sContactPartsA = [null];
const sContactPartsB = [null];
const sSatPartA = { shapeTypeId: 0, radius: 0, vertices: null, normals: null, _vertOffset: 0, _floatCount: 0 };
const sSatPartB = { shapeTypeId: 0, radius: 0, vertices: null, normals: null, _vertOffset: 0, _floatCount: 0 };
function entityHasCompoundParts(entity) {
    return (entity.collisionParts?.length ?? 0) > 1;
}
function contactPartsRef(entity, compound, scratch) {
    if (compound) return entity.collisionParts;
    scratch[0] = entity.shape;
    return scratch;
}
function bindSatPartProxy(proxy, partRow) {
    const slab = kineticDynamicSlab;
    proxy.shapeTypeId = slab.partShapeKind[partRow];
    proxy.radius = slab.partRadius[partRow];
    proxy.vertices = slab.shapeVertPool;
    proxy.normals = slab.shapeNormPool;
    proxy._vertOffset = slab.partVertOffset[partRow];
    proxy._floatCount = slab.partVertFloatCount[partRow];
}
function satCheckPartRowsAtPose(partRowA, partRowB, xA, yA, cosA, sinA, xB, yB, cosB, sinB) {
    bindSatPartProxy(sSatPartA, partRowA);
    bindSatPartProxy(sSatPartB, partRowB);
    return satCheckShapesAtPose(xA, yA, cosA, sinA, sSatPartA, xB, yB, cosB, sinB, sSatPartB);
}
export function checkPairCollisionAtSlabPose(physIdA, physIdB, xA, yA, xB, yB) {
    const slab = kineticDynamicSlab;
    const geomA = slab.partGeomOffset[physIdA];
    const geomB = slab.partGeomOffset[physIdB];
    if (geomA < 0 || geomB < 0) throw new Error(`checkPairCollisionAtSlabPose: missing shape CSR for physId ${geomA < 0 ? physIdA : physIdB}`);
    const cosA = slab.cos[physIdA];
    const sinA = slab.sin[physIdA];
    const cosB = slab.cos[physIdB];
    const sinB = slab.sin[physIdB];
    const countA = slab.partCount[physIdA];
    const countB = slab.partCount[physIdB];
    if (countA === 1 && countB === 1) return satCheckPartRowsAtPose(geomA, geomB, xA, yA, cosA, sinA, xB, yB, cosB, sinB);
    let bestOverlap = -Infinity;
    let found = false;
    for (let i = 0; i < countA; i++)
        for (let j = 0; j < countB; j++) {
            if (!satCheckPartRowsAtPose(geomA + i, geomB + j, xA, yA, cosA, sinA, xB, yB, cosB, sinB)) continue;
            const overlap = SAT_RESULT[0];
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                found = true;
                SAT_BEST_RESULT.set(SAT_RESULT);
            }
        }
    if (found) {
        SAT_RESULT.set(SAT_BEST_RESULT);
        return true;
    }
    return false;
}
export function checkEntityPairCollisionAtSlabPose(bodyA, bodyB, physIdA, physIdB, xA, yA, xB, yB) {
    return checkPairCollisionAtSlabPose(physIdA, physIdB, xA, yA, xB, yB);
}
export function circleCircleContact(xA, yA, shapeA, xB, yB, shapeB) {
    const dx = xB - xA;
    const dy = yB - yA;
    const distSq = dx * dx + dy * dy;
    const radii = shapeA.radius + shapeB.radius;
    if (distSq >= radii * radii) return false;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) {
        SAT_RESULT[0] = radii;
        SAT_RESULT[1] = 0;
        SAT_RESULT[2] = 0;
        SAT_RESULT[3] = xA;
        SAT_RESULT[4] = yA;
        SAT_RESULT[5] = 1;
        SAT_RESULT[6] = 0;
        SAT_RESULT[7] = 0;
        SAT_RESULT[8] = 0;
        return true;
    }
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const cx = xA + nx * (shapeA.radius - overlap / 2);
    const cy = yA + ny * (shapeA.radius - overlap / 2);
    SAT_RESULT[0] = overlap;
    SAT_RESULT[1] = nx;
    SAT_RESULT[2] = ny;
    SAT_RESULT[3] = cx;
    SAT_RESULT[4] = cy;
    SAT_RESULT[5] = 0;
    SAT_RESULT[6] = 0;
    SAT_RESULT[7] = 0;
    SAT_RESULT[8] = 1;
    SAT_RESULT[9] = cx;
    SAT_RESULT[10] = cy;
    SAT_RESULT[11] = 0;
    SAT_RESULT[12] = 0;
    return true;
}
function satSwapCirclePolyContactFeatures() {
    SAT_RESULT[1] = -SAT_RESULT[1];
    SAT_RESULT[2] = -SAT_RESULT[2];
    const featA = SAT_RESULT[6];
    SAT_RESULT[6] = SAT_RESULT[7];
    SAT_RESULT[7] = featA;
    const pointCount = SAT_RESULT[8];
    for (let p = 0; p < pointCount; p++) {
        const offset = 9 + p * 4;
        const fA = SAT_RESULT[offset + 2];
        SAT_RESULT[offset + 2] = SAT_RESULT[offset + 3];
        SAT_RESULT[offset + 3] = fA;
    }
}
function satCheckShapesAtPose(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, shapeB) {
    if (!shapeA || !shapeB) return false;
    if (shapeA.shapeTypeId === SHAPE_TYPE_CIRCLE && shapeB.shapeTypeId === SHAPE_TYPE_CIRCLE) return circleCircleContact(xA, yA, shapeA, xB, yB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_POLYGON && shapeB.shapeTypeId === SHAPE_TYPE_POLYGON) return satPolygonPolygon(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_CIRCLE && shapeB.shapeTypeId === SHAPE_TYPE_POLYGON) return satCirclePolygon(xA, yA, shapeA, xB, yB, cosB, sinB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_POLYGON && shapeB.shapeTypeId === SHAPE_TYPE_CIRCLE) {
        const hit = satCirclePolygon(xB, yB, shapeB, xA, yA, cosA, sinA, shapeA);
        if (hit) satSwapCirclePolyContactFeatures();
        return hit;
    }
    return false;
}
function bestEntityPairContactAtPose(partsA, partsB, xA, yA, cosA, sinA, xB, yB, cosB, sinB) {
    let bestOverlap = -Infinity;
    let found = false;
    for (let i = 0; i < partsA.length; i++) {
        const shapeA = partsA[i];
        for (let j = 0; j < partsB.length; j++)
            if (satCheckShapesAtPose(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, partsB[j])) {
                const overlap = SAT_RESULT[0];
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    found = true;
                    SAT_BEST_RESULT.set(SAT_RESULT);
                }
            }
    }
    if (found) {
        SAT_RESULT.set(SAT_BEST_RESULT);
        return true;
    }
    return false;
}
export function checkEntityPairCollision(bodyA, bodyB, xA = bodyA.x, yA = bodyA.y, xB = bodyB.x, yB = bodyB.y) {
    const facingA = entityFacing(bodyA);
    const facingB = entityFacing(bodyB);
    const cosA = Math.cos(facingA);
    const sinA = Math.sin(facingA);
    const cosB = Math.cos(facingB);
    const sinB = Math.sin(facingB);
    const compoundA = entityHasCompoundParts(bodyA);
    const compoundB = entityHasCompoundParts(bodyB);
    if (!compoundA && !compoundB) return satCheckShapesAtPose(xA, yA, cosA, sinA, bodyA.shape, xB, yB, cosB, sinB, bodyB.shape);
    return bestEntityPairContactAtPose(contactPartsRef(bodyA, compoundA, sContactPartsA), contactPartsRef(bodyB, compoundB, sContactPartsB), xA, yA, cosA, sinA, xB, yB, cosB, sinB);
}
export function satCheckCollision(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
    return satCheckShapesAtPose(xA, yA, Math.cos(angleA), Math.sin(angleA), shapeA, xB, yB, Math.cos(angleB), Math.sin(angleB), shapeB);
}
const sWallVerts = new Float32Array(8);
const sWallNorms = new Float32Array(8);
function fillWallBoxF32(segId) {
    const slab = staticWallSegmentSlab;
    const hx = slab.width[segId] * 0.5;
    const hy = slab.height[segId] * 0.5;
    sWallVerts[0] = -hx;
    sWallVerts[1] = -hy;
    sWallVerts[2] = hx;
    sWallVerts[3] = -hy;
    sWallVerts[4] = hx;
    sWallVerts[5] = hy;
    sWallVerts[6] = -hx;
    sWallVerts[7] = hy;
    rebuildLivePolygonNormals(sWallVerts, sWallNorms, 8);
}
function satPolygonVsWallSegmentF32(px, py, cos, sin, verts, norms, vo, n, segId) {
    fillWallBoxF32(segId);
    const slab = staticWallSegmentSlab;
    const angle = slab.angle[segId];
    return satPolygonPolygonF32(px, py, cos, sin, verts, norms, vo, n, slab.x[segId], slab.y[segId], Math.cos(angle), Math.sin(angle), sWallVerts, sWallNorms, 0, 8);
}
export function satCheckPolygonVsWallSegment(px, py, angle, shape, segId) {
    const vo = shape._vertOffset || 0;
    const n = shape._floatCount != null ? shape._floatCount : shape.vertices.length;
    return satPolygonVsWallSegmentF32(px, py, Math.cos(angle), Math.sin(angle), shape.vertices, shape.normals, vo, n, segId);
}
function satPolygonPolygonF32(xA, yA, cosA, sinA, vertsA, normsA, voA, nA, xB, yB, cosB, sinB, vertsB, normsB, voB, nB) {
    let minOverlap = Infinity;
    let minNormalX = 0;
    let minNormalY = 0;
    let refPolyIsA = true;
    let refEdgeIndex = 0;
    for (let i = 0; i < nA; i += 2) {
        const nx = normsA[voA + i];
        const ny = normsA[voA + i + 1];
        const rNx = nx * cosA - ny * sinA;
        const rNy = nx * sinA + ny * cosA;
        satProjectPolygonF32(PROJ_A, rNx, rNy, vertsA, voA, nA, xA, yA, cosA, sinA);
        satProjectPolygonF32(PROJ_B, rNx, rNy, vertsB, voB, nB, xB, yB, cosB, sinB);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < minOverlap) {
            minOverlap = overlap;
            minNormalX = rNx;
            minNormalY = rNy;
            refPolyIsA = true;
            refEdgeIndex = i / 2;
        }
    }
    for (let i = 0; i < nB; i += 2) {
        const nx = normsB[voB + i];
        const ny = normsB[voB + i + 1];
        const rNx = nx * cosB - ny * sinB;
        const rNy = nx * sinB + ny * cosB;
        satProjectPolygonF32(PROJ_A, rNx, rNy, vertsA, voA, nA, xA, yA, cosA, sinA);
        satProjectPolygonF32(PROJ_B, rNx, rNy, vertsB, voB, nB, xB, yB, cosB, sinB);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < minOverlap) {
            minOverlap = overlap;
            minNormalX = rNx;
            minNormalY = rNy;
            refPolyIsA = false;
            refEdgeIndex = i / 2;
        }
    }
    const dx = xB - xA;
    const dy = yB - yA;
    if (dx * minNormalX + dy * minNormalY < 0) {
        minNormalX = -minNormalX;
        minNormalY = -minNormalY;
    }
    const pointCount = buildPolyPolyContactManifoldF32(xA, yA, cosA, sinA, vertsA, normsA, voA, nA, xB, yB, cosB, sinB, vertsB, normsB, voB, nB, minNormalX, minNormalY, refPolyIsA, refEdgeIndex);
    if (pointCount == null) {
        const featureB = findExtremeVertexIndexAt(vertsB, voB, nB, xB, yB, cosB, sinB, minNormalX, minNormalY, false);
        const featureA = findExtremeVertexIndexAt(vertsA, voA, nA, xA, yA, cosA, sinA, minNormalX, minNormalY, true);
        const ai = featureA * 2;
        const bi = featureB * 2;
        const contactAx = xA + vertsA[voA + ai] * cosA - vertsA[voA + ai + 1] * sinA;
        const contactAy = yA + vertsA[voA + ai] * sinA + vertsA[voA + ai + 1] * cosA;
        const contactBx = xB + vertsB[voB + bi] * cosB - vertsB[voB + bi + 1] * sinB;
        const contactBy = yB + vertsB[voB + bi] * sinB + vertsB[voB + bi + 1] * cosB;
        const cx = (contactAx + contactBx) / 2;
        const cy = (contactAy + contactBy) / 2;
        SAT_RESULT[0] = minOverlap;
        SAT_RESULT[1] = minNormalX;
        SAT_RESULT[2] = minNormalY;
        SAT_RESULT[3] = cx;
        SAT_RESULT[4] = cy;
        SAT_RESULT[5] = 0;
        SAT_RESULT[6] = featureA;
        SAT_RESULT[7] = featureB;
        SAT_RESULT[8] = 1;
        SAT_RESULT[9] = cx;
        SAT_RESULT[10] = cy;
        SAT_RESULT[11] = featureA;
        SAT_RESULT[12] = featureB;
        return true;
    }
    SAT_RESULT[0] = minOverlap;
    SAT_RESULT[1] = minNormalX;
    SAT_RESULT[2] = minNormalY;
    SAT_RESULT[3] = SAT_RESULT[9];
    SAT_RESULT[4] = SAT_RESULT[10];
    SAT_RESULT[5] = 0;
    SAT_RESULT[6] = SAT_RESULT[11];
    SAT_RESULT[7] = SAT_RESULT[12];
    SAT_RESULT[8] = pointCount;
    return true;
}
function satPolygonPolygon(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, shapeB) {
    const metaA = bindShapeVertMeta(sVertMetaA, shapeA);
    const metaB = bindShapeVertMeta(sVertMetaB, shapeB);
    return satPolygonPolygonF32(xA, yA, cosA, sinA, metaA.verts, metaA.norms, metaA.vo, metaA.n, xB, yB, cosB, sinB, metaB.verts, metaB.norms, metaB.vo, metaB.n);
}
function satCirclePolygon(cxCircle, cyCircle, circleShape, pxPoly, pyPoly, cosP, sinP, polyShape) {
    if (isNaN(cxCircle) || isNaN(cyCircle) || isNaN(pxPoly) || isNaN(pyPoly)) return false;
    let minOverlap = Infinity;
    let minNormalX = 0;
    let minNormalY = 0;
    const meta = bindShapeVertMeta(sVertMetaA, polyShape);
    const radius = circleShape.radius;
    for (let i = 0; i < meta.n; i += 2) {
        const nx = meta.norms[meta.vo + i];
        const ny = meta.norms[meta.vo + i + 1];
        const rNx = nx * cosP - ny * sinP;
        const rNy = nx * sinP + ny * cosP;
        satProjectCircleR(PROJ_A, rNx, rNy, cxCircle, cyCircle, radius);
        satProjectPolygonF32(PROJ_B, rNx, rNy, meta.verts, meta.vo, meta.n, pxPoly, pyPoly, cosP, sinP);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < minOverlap) {
            minOverlap = overlap;
            minNormalX = rNx;
            minNormalY = rNy;
        }
    }
    const featureB = findClosestWorldVertexIndexAt(meta.verts, meta.vo, meta.n, pxPoly, pyPoly, cosP, sinP, cxCircle, cyCircle);
    const vi = featureB * 2;
    const closestVx = pxPoly + meta.verts[meta.vo + vi] * cosP - meta.verts[meta.vo + vi + 1] * sinP;
    const closestVy = pyPoly + meta.verts[meta.vo + vi] * sinP + meta.verts[meta.vo + vi + 1] * cosP;
    const dx = closestVx - cxCircle;
    const dy = closestVy - cyCircle;
    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const nX = dx / len;
        const nY = dy / len;
        satProjectCircleR(PROJ_A, nX, nY, cxCircle, cyCircle, radius);
        satProjectPolygonF32(PROJ_B, nX, nY, meta.verts, meta.vo, meta.n, pxPoly, pyPoly, cosP, sinP);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < minOverlap) {
            minOverlap = overlap;
            minNormalX = nX;
            minNormalY = nY;
        }
    }
    const cx = pxPoly - cxCircle;
    const cy = pyPoly - cyCircle;
    if (cx * minNormalX + cy * minNormalY < 0) {
        minNormalX = -minNormalX;
        minNormalY = -minNormalY;
    }
    const contactX = cxCircle + minNormalX * (radius - minOverlap / 2);
    const contactY = cyCircle + minNormalY * (radius - minOverlap / 2);
    SAT_RESULT[0] = minOverlap;
    SAT_RESULT[1] = minNormalX;
    SAT_RESULT[2] = minNormalY;
    SAT_RESULT[3] = contactX;
    SAT_RESULT[4] = contactY;
    SAT_RESULT[5] = 0;
    SAT_RESULT[6] = 0;
    SAT_RESULT[7] = featureB;
    SAT_RESULT[8] = 1;
    SAT_RESULT[9] = contactX;
    SAT_RESULT[10] = contactY;
    SAT_RESULT[11] = 0;
    SAT_RESULT[12] = featureB;
    return true;
}
function satProjectPolygonF32(out, axisX, axisY, verts, vo, floatCount, px, py, cos, sin) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < floatCount; i += 2) {
        const vx_local = verts[vo + i];
        const vy_local = verts[vo + i + 1];
        const rx = vx_local * cos - vy_local * sin;
        const ry = vx_local * sin + vy_local * cos;
        const vx = px + rx;
        const vy = py + ry;
        const projection = vx * axisX + vy * axisY;
        if (projection < min) min = projection;
        if (projection > max) max = projection;
    }
    out[0] = min;
    out[1] = max;
}
function satProjectPolygon(out, axisX, axisY, shape, px, py, cos, sin) {
    const meta = bindShapeVertMeta(sVertMetaA, shape);
    satProjectPolygonF32(out, axisX, axisY, meta.verts, meta.vo, meta.n, px, py, cos, sin);
}
function satProjectCircleR(out, axisX, axisY, cx, cy, radius) {
    const projection = cx * axisX + cy * axisY;
    out[0] = projection - radius;
    out[1] = projection + radius;
}
function satProjectCircle(out, axisX, axisY, cx, cy, shape) {
    satProjectCircleR(out, axisX, axisY, cx, cy, shape.radius);
}
/**
 * Position correction along contact normals (no velocity change).
 */
export function applySlabPositionCorrection(physId, normalX, normalY, overlap) {
    kineticDynamicSlab.x[physId] += normalX * overlap;
    kineticDynamicSlab.y[physId] += normalY * overlap;
}
/**
 * Mass-weighted separation of two overlapping bodies.
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB) {
    const totalMass = massA + massB;
    addXY(a, -normalX * overlap * (massB / totalMass), -normalY * overlap * (massB / totalMass));
    addXY(b, normalX * overlap * (massA / totalMass), normalY * overlap * (massA / totalMass));
}
/** Circle centers closer than this share no valid contact normal — unstack only, no impulse. */
export const COINCIDENT_CIRCLE_EPS = 1e-10;
/**
 * Positional unstack when circle centers coincide (invalid state; breaks symmetry for next pass).
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function computeCircleWallContact(buf, o, ex, ey, normalX, normalY, radius) {
    buf[o] = ex - normalX * radius;
    buf[o + 1] = ey - normalY * radius;
}
export function computePolygonWallContact(buf, o, ex, ey, normalX, normalY, overlap, cx = NaN, cy = NaN) {
    buf[o] = !isNaN(cx) ? cx : ex - normalX * overlap;
    buf[o + 1] = !isNaN(cy) ? cy : ey - normalY * overlap;
}
export const BROADPHASE_KIND = { Circle: 1, Obb: 2 };
function obbWorldAabbF32(buf, o, cx, cy, hx, hy, cos, sin) {
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
    buf[o] = minX;
    buf[o + 1] = minY;
    buf[o + 2] = maxX;
    buf[o + 3] = maxY;
}
function entityWorldAabbFromShapeF32(buf, o, entity) {
    const x = entity.x;
    const y = entity.y;
    const angle = entityFacing(entity);
    if (entityHasCompoundParts(entity)) {
        computeCompoundLocalBoundsF32(ENGINE_F32, P_AABB_A, entity.collisionParts);
        const hx = (ENGINE_F32[P_AABB_A + 2] - ENGINE_F32[P_AABB_A]) * 0.5;
        const hy = (ENGINE_F32[P_AABB_A + 3] - ENGINE_F32[P_AABB_A + 1]) * 0.5;
        const localCx = (ENGINE_F32[P_AABB_A] + ENGINE_F32[P_AABB_A + 2]) * 0.5;
        const localCy = (ENGINE_F32[P_AABB_A + 1] + ENGINE_F32[P_AABB_A + 3]) * 0.5;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cx = x + localCx * cos - localCy * sin;
        const cy = y + localCx * sin + localCy * cos;
        obbWorldAabbF32(buf, o, cx, cy, hx, hy, cos, sin);
        return;
    }
    const shape = entity.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
        const r = shape.radius;
        buf[o] = x - r;
        buf[o + 1] = y - r;
        buf[o + 2] = x + r;
        buf[o + 3] = y + r;
        return;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        convexFootprintHalfExtents(ENGINE_F32, P_VEC_A, shape.vertices);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        obbWorldAabbF32(buf, o, x, y, ENGINE_F32[P_VEC_A], ENGINE_F32[P_VEC_A + 1], cos, sin);
        return;
    }
    throw new Error(`entityWorldAabbFromShapeF32: unknown shapeTypeId ${shape?.shapeTypeId}`);
}
export function entityWorldAabbF32(buf, o, entity) {
    const physId = entity._physId;
    const slab = kineticDynamicSlab;
    if (physId !== undefined && physId >= 0) {
        if (slab.shapeKind[physId] === SHAPE_TYPE_CIRCLE) {
            const cx = slab.x[physId];
            const cy = slab.y[physId];
            const r = slab.r[physId];
            buf[o] = cx - r;
            buf[o + 1] = cy - r;
            buf[o + 2] = cx + r;
            buf[o + 3] = cy + r;
            return;
        }
        if (slab.shapeKind[physId] !== 0 || slab.partCount[physId] > 1) {
            obbWorldAabbF32(buf, o, slab.x[physId], slab.y[physId], slab.hx[physId], slab.hy[physId], slab.cos[physId], slab.sin[physId]);
            return;
        }
    }
    entityWorldAabbFromShapeF32(buf, o, entity);
}
function kineticActivity() {
    return collisionSettings.kineticActivity;
}
/** @param {number} extent */
export function neighborQueryPadForExtent(extent) {
    const pad = kineticActivity().neighborQueryPad;
    return Math.min(pad.maxPad, Math.max(pad.minPad, extent * pad.padScale));
}
export function entityCollisionSpan(entity) {
    if (entityHasCompoundParts(entity)) {
        computeCompoundLocalBoundsF32(ENGINE_F32, P_AABB_A, entity.collisionParts);
        return lengthXY((ENGINE_F32[P_AABB_A + 2] - ENGINE_F32[P_AABB_A]) * 0.5, (ENGINE_F32[P_AABB_A + 3] - ENGINE_F32[P_AABB_A + 1]) * 0.5);
    }
    return entity.shape.getBoundingRadius();
}
export function markBroadphaseDirty(entity) {
    entity._broadphaseDirty = true;
}
export function entityContainedInAabbF32(entity, buf, o) {
    entityWorldAabbF32(ENGINE_F32, P_AABB_A, entity);
    return buf[o] <= ENGINE_F32[P_AABB_A] && buf[o + 1] <= ENGINE_F32[P_AABB_A + 1] && buf[o + 2] >= ENGINE_F32[P_AABB_A + 2] && buf[o + 3] >= ENGINE_F32[P_AABB_A + 3];
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
export function isKinematicallyActiveSlab(physId) {
    const slab = kineticDynamicSlab;
    const vx = slab.vx[physId];
    const vy = slab.vy[physId];
    const w = slab.w[physId];
    const { movingSpeedSq, rotatingSpeedRad } = kineticActivity();
    return speedSqXY(vx, vy) > movingSpeedSq || w * w > rotatingSpeedRad * rotatingSpeedRad;
}
function slabCollisionSpan(physId) {
    const slab = kineticDynamicSlab;
    if (slab.shapeKind[physId] === SHAPE_TYPE_CIRCLE) return slab.r[physId];
    return lengthXY(slab.hx[physId], slab.hy[physId]);
}
function ensureSpatialNeighborArena(needed) {
    ensureGrowI32(kineticDynamicSlab, "spatialNeighborEids", needed, kineticDynamicSlab.spatialNeighborEidsUsed);
}
export function bakeSpatialNeighborCsr(spatialFrame) {
    const slab = kineticDynamicSlab;
    const grid = spatialFrame.entityGrid;
    slab.spatialNeighborEidsUsed = 0;
    const padBase = ENGINE_BOUNDS_BASE + B_PAD;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physId = slab.activePhysIds[i];
        const span = slabCollisionSpan(physId);
        const searchRadius = span + grid.maxInsertedExtent + neighborQueryPadForExtent(span);
        centerReachAabbF32(ENGINE_F32, padBase, slab.x[physId], slab.y[physId], searchRadius);
        let offset = slab.spatialNeighborEidsUsed;
        ensureSpatialNeighborArena(offset + 16);
        let count = grid.collectEidsInBoundsF32(ENGINE_F32, padBase, slab.spatialNeighborEids.subarray(offset), slab.spatialNeighborEids.length - offset, physId);
        while (count < 0) {
            ensureSpatialNeighborArena(Math.max(offset + 16, slab.spatialNeighborEids.length * 2));
            count = grid.collectEidsInBoundsF32(ENGINE_F32, padBase, slab.spatialNeighborEids.subarray(offset), slab.spatialNeighborEids.length - offset, physId);
        }
        slab.spatialNeighborOffset[physId] = offset;
        slab.spatialNeighborCount[physId] = count;
        slab.spatialNeighborEidsUsed = offset + count;
    }
}
function normalizeEntityRollQuat(physId) {
    const len = Math.hypot(entityRollQw[physId], entityRollQx[physId], entityRollQy[physId], entityRollQz[physId]);
    if (len < 1e-8) {
        entityRollQw[physId] = 1;
        entityRollQx[physId] = 0;
        entityRollQy[physId] = 0;
        entityRollQz[physId] = 0;
        return;
    }
    entityRollQw[physId] /= len;
    entityRollQx[physId] /= len;
    entityRollQy[physId] /= len;
    entityRollQz[physId] /= len;
}
export function snapshotKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        normalizeKineticBody(entity);
        writeStaticKineticSlabSlot(entity);
        syncEntitySlotPoseFromRef(entity._physId, entity);
        stampKineticBodyFromEntity(entity._physId, entity);
    }
}
export function refreshActiveKineticBodySlabPose(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        const physId = entity._physId;
        if (slab.shapeKind[physId] !== SHAPE_TYPE_CIRCLE) {
            const angle = entityFacing(entity);
            slab.cos[physId] = Math.cos(angle);
            slab.sin[physId] = Math.sin(angle);
        }
    }
}
export function shouldResolveKineticPair(a, b, overlaps) {
    return overlaps && (isKinematicallyActive(a) || isKinematicallyActive(b));
}
export function allowsKineticCollisionPairSlab(physIdA, physIdB, overlaps) {
    if (physIdA === physIdB) return false;
    const dyn = kineticDynamicSlab;
    const stat = kineticStaticSlab;
    if (dyn.activeSlot[physIdB] >= 0 && stat.entityId[physIdA] >= stat.entityId[physIdB]) return false;
    return overlaps && (isKinematicallyActiveSlab(physIdA) || isKinematicallyActiveSlab(physIdB));
}
export function allowsKineticCollisionPair(primary, other, overlaps) {
    return allowsKineticCollisionPairSlab(primary._physId, other._physId, overlaps);
}
function kineticOverlapsWallCandidates(px, py, body, candidates) {
    if (!candidates.used) return false;
    const bodyFacing = entityFacing(body);
    const bodyCos = Math.cos(bodyFacing);
    const bodySin = Math.sin(bodyFacing);
    const compound = entityHasCompoundParts(body);
    const partCount = compound ? body.collisionParts.length : 1;
    for (let p = 0; p < partCount; p++) {
        const shape = compound ? body.collisionParts[p] : body.shape;
        if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < candidates.used; i++) if (distanceSqToSegment(candidates.buf[i], px, py) <= radiusSq) return true;
            continue;
        }
        for (let i = 0; i < candidates.used; i++) {
            const segId = candidates.buf[i];
            if (satPolygonVsWallSegmentF32(px, py, bodyCos, bodySin, shape.vertices, shape.normals, 0, shape.vertices.length, segId)) return true;
        }
    }
    return false;
}
export function shouldResolveKineticBodyAgainstWalls(body, candidates) {
    if (!body.strategy?.isKinetic) return false;
    if (body.needsWallCollision?.()) return true;
    const physId = body._physId;
    if (physId !== undefined && physId !== -1) return kineticOverlapsWallCandidates(kineticDynamicSlab.x[physId], kineticDynamicSlab.y[physId], body, candidates);
    return kineticOverlapsWallCandidates(body.x, body.y, body, candidates);
}
function applyStaticSurfaceImpulseSlab(physId, normalX, normalY, cx, cy, restitution, friction) {
    const dyn = kineticDynamicSlab;
    const stat = kineticStaticSlab;
    const bx = dyn.x[physId];
    const by = dyn.y[physId];
    const bvx = dyn.vx[physId];
    const bvy = dyn.vy[physId];
    const bw = dyn.w[physId];
    const rx = cx - bx;
    const ry = cy - by;
    const vpx = bvx - bw * ry;
    const vpy = bvy + bw * rx;
    const approachDot = dotXY(vpx, vpy, normalX, normalY);
    if (approachDot >= 0) return approachDot;
    const invMassVal = stat.invMass[physId];
    const invI = stat.invI[physId];
    const hasMoment = invI > 0;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    let newVx = bvx + j * normalX * invMassVal;
    let newVy = bvy + j * normalY * invMassVal;
    let newW = bw;
    if (hasMoment) newW = bw + j * cross * invI;
    const tx = -normalY;
    const ty = normalX;
    const vpxNew = newVx - newW * ry;
    const vpyNew = newVy + newW * rx;
    const tangentDot = dotXY(vpxNew, vpyNew, tx, ty);
    const crossT = rx * ty - ry * tx;
    const denomT = invMassVal + crossT * crossT * invI;
    const jt = (-tangentDot * (1 - friction)) / denomT;
    newVx += jt * tx * invMassVal;
    newVy += jt * ty * invMassVal;
    if (hasMoment) newW += jt * crossT * invI;
    dyn.vx[physId] = newVx;
    dyn.vy[physId] = newVy;
    dyn.w[physId] = newW;
    return approachDot;
}
const MAX_WALL_HITS = 64;
export function createWallHitBuffer(capacity = MAX_WALL_HITS) {
    return { count: 0, approachDot: new Float32Array(capacity), normalX: new Float32Array(capacity), normalY: new Float32Array(capacity), contactX: new Float32Array(capacity), contactY: new Float32Array(capacity), gridIdx: new Int32Array(capacity), gridSide: new Uint8Array(capacity), flags: new Uint8Array(capacity) };
}
function appendWallHit(outHits, approachDot, normalX, normalY, contactX, contactY, segId) {
    const i = outHits.count;
    if (i >= outHits.approachDot.length) throw new Error("wall hit buffer capacity exceeded");
    const slab = staticWallSegmentSlab;
    outHits.approachDot[i] = approachDot;
    outHits.normalX[i] = normalX;
    outHits.normalY[i] = normalY;
    outHits.contactX[i] = contactX;
    outHits.contactY[i] = contactY;
    outHits.gridIdx[i] = slab.gridIdx[segId];
    outHits.gridSide[i] = slab.gridSide[segId];
    outHits.flags[i] = slab.flags[segId];
    outHits.count = i + 1;
}
function resolveAgainstWallSegmentsSlab(physId, body, shape, segIds, restitution, friction, passes, shouldBreakWallHit, outHits) {
    const dyn = kineticDynamicSlab;
    const slab = staticWallSegmentSlab;
    let collided = false;
    const wantHits = shouldBreakWallHit != null && outHits != null;
    const radius = shape.getBoundingRadius();
    let bestNormalX = 0;
    let bestNormalY = 0;
    let bestOverlap = 0;
    let bestCx = NaN;
    let bestCy = NaN;
    let bestSegId = -1;
    for (let pass = 0; pass < passes; pass++) {
        let hasBest = false;
        const bx0 = dyn.x[physId];
        const by0 = dyn.y[physId];
        const approachVx = dyn.vx[physId];
        const approachVy = dyn.vy[physId];
        const bodyAngle = entityFacing(body);
        const bodyCos = Math.cos(bodyAngle);
        const bodySin = Math.sin(bodyAngle);
        for (let si = 0; si < segIds.used; si++) {
            const segId = segIds.buf[si];
            const maxDist = radius + slab.size[segId] * 0.75;
            if (Math.abs(bx0 - slab.x[segId]) > maxDist || Math.abs(by0 - slab.y[segId]) > maxDist) continue;
            let normalX, normalY, overlap;
            let satCollisionFound = false;
            if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
                if (!circleSegmentPenetration(bx0, by0, shape.radius, segId, approachVx, approachVy)) continue;
                normalX = ENGINE_F32[P_OUT_PEN_NX];
                normalY = ENGINE_F32[P_OUT_PEN_NY];
                overlap = ENGINE_F32[P_OUT_PEN_OVERLAP];
            } else if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
                if (!satPolygonVsWallSegmentF32(bx0, by0, bodyCos, bodySin, shape.vertices, shape.normals, 0, shape.vertices.length, segId)) continue;
                normalX = -SAT_RESULT[1];
                normalY = -SAT_RESULT[2];
                overlap = SAT_RESULT[0];
                satCollisionFound = true;
            } else throw new Error(`resolveAgainstWallSegmentsSlab: unknown shapeTypeId ${shape.shapeTypeId}`);
            if (!hasBest || overlap > bestOverlap) {
                bestNormalX = normalX;
                bestNormalY = normalY;
                bestOverlap = overlap;
                bestCx = satCollisionFound ? SAT_RESULT[3] : NaN;
                bestCy = satCollisionFound ? SAT_RESULT[4] : NaN;
                bestSegId = segId;
                hasBest = true;
            }
        }
        if (!hasBest) break;
        collided = true;
        const bx = dyn.x[physId];
        const by = dyn.y[physId];
        if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) computeCircleWallContact(ENGINE_F32, P_VEC_A, bx, by, bestNormalX, bestNormalY, shape.radius);
        else computePolygonWallContact(ENGINE_F32, P_VEC_A, bx, by, bestNormalX, bestNormalY, bestOverlap, bestCx, bestCy);
        const contactX = ENGINE_F32[P_VEC_A];
        const contactY = ENGINE_F32[P_VEC_A + 1];
        const bvx = dyn.vx[physId];
        const bvy = dyn.vy[physId];
        const bw = dyn.w[physId];
        const approachDot = dotXY(bvx - bw * (contactY - by), bvy + bw * (contactX - bx), bestNormalX, bestNormalY);
        if (wantHits && shouldBreakWallHit(approachDot)) {
            appendWallHit(outHits, approachDot, bestNormalX, bestNormalY, contactX, contactY, bestSegId);
            applyStaticSurfaceImpulseSlab(physId, bestNormalX, bestNormalY, contactX, contactY, restitution, friction);
            break;
        }
        applySlabPositionCorrection(physId, bestNormalX, bestNormalY, bestOverlap);
        applyStaticSurfaceImpulseSlab(physId, bestNormalX, bestNormalY, contactX, contactY, restitution, friction);
        if (wantHits) appendWallHit(outHits, approachDot, bestNormalX, bestNormalY, contactX, contactY, bestSegId);
    }
    return collided;
}
export function resolveBodyAgainstWallSegments(body, shape, segIds, restitution = 0, friction = 0.9, shouldBreakWallHit = null, outHits = null, passes = 2) {
    const physId = body._physId;
    if (physId === undefined || physId === -1) throw new Error("resolveBodyAgainstWallSegments requires _physId");
    if (outHits) outHits.count = 0;
    normalizeKineticBody(body);
    return resolveAgainstWallSegmentsSlab(physId, body, shape, segIds, restitution, friction, passes, shouldBreakWallHit, outHits);
}
/** Clear wall-resolve frame cache so entity-pair contacts can re-resolve against walls. */
export function invalidateWallResolveCache(...entities) {
    for (let i = 0; i < entities.length; i++) entities[i]._wallResolvedFrame = null;
}
export class WallCollisionResolver {
    constructor() {
        this.hits = createWallHitBuffer();
    }
    resolve(entity, spatialFrame, shouldBreakWallHit = null) {
        if (entity._wallResolvedFrame === spatialFrame.frameId) {
            this.hits.count = 0;
            return entity._wallResolvedCollided;
        }
        entity._wallResolvedFrame = spatialFrame.frameId;
        const candidateWalls = spatialFrame.getWallCandidates(entity);
        const hits = this.hits;
        hits.count = 0;
        if (candidateWalls.used === 0) {
            entity._wallResolvedCollided = false;
            return false;
        }
        const physId = entity._physId;
        if (physId === undefined || physId === -1) throw new Error("WallCollisionResolver requires _physId");
        const wp = entity.strategy?.wallPhysics;
        const restitution = wp?.restitution ?? 0.0;
        const friction = wp?.friction ?? 0.9;
        let collided = false;
        const wantHits = shouldBreakWallHit != null;
        const outHits = wantHits ? hits : null;
        if (entityHasCompoundParts(entity)) {
            const parts = entity.collisionParts;
            for (let i = 0; i < parts.length; i++) if (resolveAgainstWallSegmentsSlab(physId, entity, parts[i], candidateWalls, restitution, friction, 2, shouldBreakWallHit, outHits)) collided = true;
        } else if (entity.shape) if (resolveAgainstWallSegmentsSlab(physId, entity, entity.shape, candidateWalls, restitution, friction, 2, shouldBreakWallHit, outHits)) collided = true;
        if (collided) wakeKineticBody(entity);
        entity._wallResolvedCollided = collided;
        return collided;
    }
}
const LINK_CAPSULE_WALL_PASSES = 4;
const islandLinkWallCandidates = new GrowI32(64);
const islandLinkWallSegmentSet = new Set();
const linkFilteredWallCandidates = new GrowI32(32);
const CONSTRAINT_EDGE_KEY_SCALE = 1_000_000;
const constraintPhysSyncSeen = new Set();
const constraintBridgePhysIds = [];
const orderUniquePhysIds = [];
const orderOrdered = [];
const sIslandSessionIndex = new Int32Array(MAX_KINETIC_CONSTRAINTS);
function constraintBodyAt(physId) {
    const body = entityRefs[physId];
    return body?._physId === physId ? body : null;
}
function orderIslandConstraintItems(startIdx, count) {
    if (count <= 1) {
        for (let i = 0; i < count; i++) orderOrderedIdxs[i] = startIdx + i;
        return;
    }
    orderUniquePhysIds.length = 0;
    for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const physA = sIslandPhysA[idx];
        const physB = sIslandPhysB[idx];
        if (physA !== -1 && orderSeenPhysIds[physA] === 0) {
            orderSeenPhysIds[physA] = 1;
            orderUniquePhysIds.push(physA);
        }
        if (physB !== -1 && orderSeenPhysIds[physB] === 0) {
            orderSeenPhysIds[physB] = 1;
            orderUniquePhysIds.push(physB);
        }
    }
    let startId = null;
    let startPhysId = null;
    for (let i = 0; i < orderUniquePhysIds.length; i++) {
        const physId = orderUniquePhysIds[i];
        const body = constraintBodyAt(physId);
        const offset = kineticDynamicSlab.linkNeighborOffset[physId];
        const nCount = kineticDynamicSlab.linkNeighborCount[physId];
        let inIslandCount = 0;
        for (let j = 0; j < nCount; j++) {
            const neighborPhys = kineticDynamicSlab.linkNeighborEids[offset + j];
            if (neighborPhys !== -1 && orderSeenPhysIds[neighborPhys] === 1) inIslandCount++;
        }
        if (inIslandCount <= 1) {
            startPhysId = physId;
            startId = body.id;
            break;
        }
    }
    if (startId == null) {
        let minId = Infinity;
        for (let i = 0; i < orderUniquePhysIds.length; i++) {
            const physId = orderUniquePhysIds[i];
            const body = constraintBodyAt(physId);
            if (body.id < minId) {
                minId = body.id;
                startPhysId = physId;
                startId = body.id;
            }
        }
    }
    orderOrdered.length = 0;
    orderUsedItems.fill(0, 0, count);
    let currentPhysId = startPhysId;
    while (orderOrdered.length < count) {
        const body = constraintBodyAt(currentPhysId);
        const offset = kineticDynamicSlab.linkNeighborOffset[currentPhysId];
        const nCount = kineticDynamicSlab.linkNeighborCount[currentPhysId];
        let advanced = false;
        for (let i = 0; i < nCount; i++) {
            const neighborPhys = kineticDynamicSlab.linkNeighborEids[offset + i];
            if (neighborPhys === -1 || orderSeenPhysIds[neighborPhys] === 0) continue;
            let itemIdx = -1;
            for (let k = 0; k < count; k++) {
                if (orderUsedItems[k] === 1) continue;
                const idx = startIdx + k;
                const physA = sIslandPhysA[idx];
                const physB = sIslandPhysB[idx];
                if ((physA === currentPhysId && physB === neighborPhys) || (physA === neighborPhys && physB === currentPhysId)) {
                    itemIdx = k;
                    break;
                }
            }
            if (itemIdx === -1) continue;
            orderOrdered.push(startIdx + itemIdx);
            orderUsedItems[itemIdx] = 1;
            currentPhysId = neighborPhys;
            advanced = true;
            break;
        }
        if (!advanced) break;
    }
    for (let i = 0; i < count; i++) if (orderUsedItems[i] === 0) orderOrdered.push(startIdx + i);
    for (let i = 0; i < orderUniquePhysIds.length; i++) orderSeenPhysIds[orderUniquePhysIds[i]] = 0;
    for (let i = 0; i < count; i++) orderOrderedIdxs[i] = orderOrdered[i];
}
function circleRadiusFromBody(body) {
    if (entityHasCompoundParts(body)) {
        const parts = body.collisionParts;
        for (let i = 0; i < parts.length; i++) if (parts[i].shapeTypeId === SHAPE_TYPE_CIRCLE) return parts[i].radius;
    } else if (body.shape.shapeTypeId === SHAPE_TYPE_CIRCLE) return body.shape.radius;
    return body.radius;
}
function linkCapsuleRadius(bodyA, bodyB) {
    return Math.max(circleRadiusFromBody(bodyA), circleRadiusFromBody(bodyB)) + 0.05;
}
function appendConstraintEntry(slab, islandIdx, store) {
    const idx = slab.count++;
    const physIdA = sIslandPhysA[islandIdx];
    const physIdB = sIslandPhysB[islandIdx];
    const storeRow = sIslandSessionIndex[islandIdx];
    const bodyA = constraintBodyAt(physIdA);
    const bodyB = constraintBodyAt(physIdB);
    const ctype = store.type[storeRow];
    slab.type[idx] = ctype;
    slab.storeRow[idx] = storeRow;
    slab.physIdA[idx] = physIdA;
    slab.physIdB[idx] = physIdB;
    if (ctype === CONSTRAINT_TYPE_ANGLE) {
        slab.static.referenceAngle[idx] = store.referenceAngle[storeRow];
        slab.static.anchorAx[idx] = 0;
        slab.static.anchorAy[idx] = 0;
        slab.static.anchorBx[idx] = 0;
        slab.static.anchorBy[idx] = 0;
        slab.static.restLength[idx] = 0;
        slab.static.capsuleRadius[idx] = 0;
    } else {
        slab.static.referenceAngle[idx] = 0;
        slab.static.anchorAx[idx] = store.anchorAx[storeRow];
        slab.static.anchorAy[idx] = store.anchorAy[storeRow];
        slab.static.anchorBx[idx] = store.anchorBx[storeRow];
        slab.static.anchorBy[idx] = store.anchorBy[storeRow];
        slab.static.restLength[idx] = store.restLength[storeRow];
        slab.static.capsuleRadius[idx] = linkCapsuleRadius(bodyA, bodyB);
    }
    normalizeKineticBody(bodyA);
    normalizeKineticBody(bodyB);
    const stat = kineticStaticSlab;
    slab.static.massA[idx] = stat.mass[physIdA];
    slab.static.massB[idx] = stat.mass[physIdB];
    slab.static.invMassA[idx] = stat.invMass[physIdA];
    slab.static.invMassB[idx] = stat.invMass[physIdB];
    slab.static.invIA[idx] = stat.invI[physIdA];
    slab.static.invIB[idx] = stat.invI[physIdB];
    slab.dynamic.accumulatedImpulse[idx] = store.accumulatedImpulse[storeRow];
}
function islandItemsAsleep(startIdx, count) {
    for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const bodyA = constraintBodyAt(sIslandPhysA[idx]);
        const bodyB = constraintBodyAt(sIslandPhysB[idx]);
        if (!bodyA.isSleeping || !bodyB.isSleeping) return false;
    }
    return count > 0;
}
function appendIslandConstraintGroup(slab, count, store) {
    const groupStart = slab.count;
    for (let i = 0; i < count; i++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS) break;
        appendConstraintEntry(slab, orderOrderedIdxs[i], store);
    }
    const addedCount = slab.count - groupStart;
    if (addedCount === 0) return;
    slab.groupCounts[slab.groupCount] = addedCount;
    slab.groupCount++;
}
function syncConstraintSlabBodies(slab) {
    constraintPhysSyncSeen.clear();
    for (let i = 0; i < slab.count; i++) {
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        if (!constraintPhysSyncSeen.has(physIdA)) {
            constraintPhysSyncSeen.add(physIdA);
            syncEntitySlotPoseFromRef(physIdA, constraintBodyAt(physIdA));
        }
        if (!constraintPhysSyncSeen.has(physIdB)) {
            constraintPhysSyncSeen.add(physIdB);
            syncEntitySlotPoseFromRef(physIdB, constraintBodyAt(physIdB));
        }
    }
}
function collectActiveConstraintPhysIds(slab, out) {
    constraintPhysSyncSeen.clear();
    out.length = 0;
    for (let i = 0; i < slab.activeCount; i++) {
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        if (!constraintPhysSyncSeen.has(physIdA)) {
            constraintPhysSyncSeen.add(physIdA);
            out.push(physIdA);
        }
        if (!constraintPhysSyncSeen.has(physIdB)) {
            constraintPhysSyncSeen.add(physIdB);
            out.push(physIdB);
        }
    }
}
export function gatherKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    slab.reset();
    const spatialFrame = tick.frame;
    const session = tick.world.kinetic;
    const plan = ensureKineticIslandPlan(session, spatialFrame._kineticBodies);
    const store = kineticConstraintStore;
    sBucketCounts.fill(0);
    let bucketCount = 0;
    for (let i = 0; i < store.count; i++) {
        const ctype = store.type[i];
        if (ctype !== CONSTRAINT_TYPE_DISTANCE && ctype !== CONSTRAINT_TYPE_ANGLE) continue;
        const physIdA = store.physIdA[i];
        const physIdB = store.physIdB[i];
        if (physIdA < 0 || physIdB < 0) continue;
        const bodyA = constraintBodyAt(physIdA);
        const bodyB = constraintBodyAt(physIdB);
        if (!bodyA || !bodyB || bodyA.isDead || bodyB.isDead) continue;
        if (bodyA.id !== store.bodyAId[i] || bodyB.id !== store.bodyBId[i]) continue;
        if (!bodyA.strategy?.isKinetic || !bodyB.strategy?.isKinetic) continue;
        let root = bodyA.id;
        const r = kineticDynamicSlab.islandRoot[physIdA];
        if (r !== -1) root = r;
        let bucketIdx = -1;
        for (let j = 0; j < bucketCount; j++)
            if (bucketRoots[j] === root) {
                bucketIdx = j;
                break;
            }
        if (bucketIdx === -1)
            if (bucketCount < MAX_ISLAND_GROUPS) {
                bucketIdx = bucketCount;
                bucketRoots[bucketCount] = root;
                bucketCount++;
            }
        if (bucketIdx !== -1) sBucketCounts[bucketIdx]++;
    }
    let totalItems = 0;
    for (let i = 0; i < bucketCount; i++) {
        sBucketStartIdx[i] = totalItems;
        sBucketFillIdx[i] = totalItems;
        totalItems += sBucketCounts[i];
    }
    for (let i = 0; i < store.count; i++) {
        const ctype = store.type[i];
        if (ctype !== CONSTRAINT_TYPE_DISTANCE && ctype !== CONSTRAINT_TYPE_ANGLE) continue;
        const physIdA = store.physIdA[i];
        const physIdB = store.physIdB[i];
        if (physIdA < 0 || physIdB < 0) continue;
        const bodyA = constraintBodyAt(physIdA);
        const bodyB = constraintBodyAt(physIdB);
        if (!bodyA || !bodyB || bodyA.isDead || bodyB.isDead) continue;
        if (bodyA.id !== store.bodyAId[i] || bodyB.id !== store.bodyBId[i]) continue;
        if (!bodyA.strategy?.isKinetic || !bodyB.strategy?.isKinetic) continue;
        let root = bodyA.id;
        const r = kineticDynamicSlab.islandRoot[physIdA];
        if (r !== -1) root = r;
        let bucketIdx = -1;
        for (let j = 0; j < bucketCount; j++)
            if (bucketRoots[j] === root) {
                bucketIdx = j;
                break;
            }
        if (bucketIdx !== -1) {
            const idx = sBucketFillIdx[bucketIdx]++;
            sIslandSessionIndex[idx] = i;
            sIslandPhysA[idx] = physIdA;
            sIslandPhysB[idx] = physIdB;
        }
    }
    for (let i = 0; i < bucketCount; i++) {
        const start = sBucketStartIdx[i];
        const count = sBucketCounts[i];
        orderIslandConstraintItems(start, count);
        sIslandAwake[i] = islandItemsAsleep(start, count) ? 0 : 1;
    }
    for (let g = 0; g < bucketCount; g++) {
        if (sIslandAwake[g] === 0) continue;
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        const start = sBucketStartIdx[g];
        const count = sBucketCounts[g];
        orderIslandConstraintItems(start, count);
        appendIslandConstraintGroup(slab, count, store);
    }
    slab.activeCount = slab.count;
    for (let g = 0; g < bucketCount; g++) {
        if (sIslandAwake[g] === 1) continue;
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        const start = sBucketStartIdx[g];
        const count = sBucketCounts[g];
        orderIslandConstraintItems(start, count);
        appendIslandConstraintGroup(slab, count, store);
    }
    syncConstraintSlabBodies(slab);
}
function linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, segId) {
    const slab = staticWallSegmentSlab;
    const reach = capsuleRadius + slab.size[segId] * 0.75;
    const minX = Math.min(ax, bx) - reach;
    const maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach;
    const maxY = Math.max(ay, by) + reach;
    const sx = slab.x[segId];
    const sy = slab.y[segId];
    return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
}
function mergeWallCandidatesInto(candidates, out) {
    for (let i = 0; i < candidates.used; i++) {
        const segId = candidates.buf[i];
        if (islandLinkWallSegmentSet.has(segId)) continue;
        islandLinkWallSegmentSet.add(segId);
        out.push(segId);
    }
}
function appendBodyWallCandidates(spatialFrame, body, gatherMark, out) {
    if (body._linkWallGatherMark === gatherMark) return;
    body._linkWallGatherMark = gatherMark;
    mergeWallCandidatesInto(spatialFrame.getWallCandidates(body), out);
}
function gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, out) {
    out.clear();
    islandLinkWallSegmentSet.clear();
    for (let i = start; i < start + count; i++) {
        appendBodyWallCandidates(spatialFrame, constraintBodyAt(slab.physIdA[i]), gatherMark, out);
        appendBodyWallCandidates(spatialFrame, constraintBodyAt(slab.physIdB[i]), gatherMark, out);
    }
}
function collectLinkOverlappingWalls(ax, ay, bx, by, capsuleRadius, walls, out) {
    out.clear();
    for (let i = 0; i < walls.used; i++) {
        const segId = walls.buf[i];
        if (linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, segId)) out.push(segId);
    }
}
function shouldProjectLinkCapsuleAgainstWalls(slab, i, capsuleRadius, islandWalls, linkWallsOut) {
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const bodyA = constraintBodyAt(physIdA);
    const bodyB = constraintBodyAt(physIdB);
    if (bodyA.isSleeping && bodyB.isSleeping) {
        linkWallsOut.clear();
        return false;
    }
    const dynSlab = kineticDynamicSlab;
    worldAnchorFromSlab(bodyA, physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, P_VEC_A);
    worldAnchorFromSlab(bodyB, physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, P_VEC_B);
    const waX = ENGINE_F32[P_VEC_A];
    const waY = ENGINE_F32[P_VEC_A + 1];
    const wbX = ENGINE_F32[P_VEC_B];
    const wbY = ENGINE_F32[P_VEC_B + 1];
    collectLinkOverlappingWalls(waX, waY, wbX, wbY, capsuleRadius, islandWalls, linkWallsOut);
    return linkWallsOut.used > 0;
}
function translateLinkAwayFromSlabWall(physIdA, physIdB, normalX, normalY, overlap) {
    applySlabPositionCorrection(physIdA, normalX, normalY, overlap);
    applySlabPositionCorrection(physIdB, normalX, normalY, overlap);
}
function projectDistanceLinkCapsuleAgainstWalls(slab, i, linkWalls, spatialFrame) {
    if (!linkWalls.used) return;
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const bodyA = constraintBodyAt(physIdA);
    const bodyB = constraintBodyAt(physIdB);
    const capsuleRadius = slab.static.capsuleRadius[i];
    const dynSlab = kineticDynamicSlab;
    const approachX = (dynSlab.vx[physIdA] + dynSlab.vx[physIdB]) * 0.5;
    const approachY = (dynSlab.vy[physIdA] + dynSlab.vy[physIdB]) * 0.5;
    for (let pass = 0; pass < LINK_CAPSULE_WALL_PASSES; pass++) {
        worldAnchorFromSlab(bodyA, physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, P_VEC_A);
        worldAnchorFromSlab(bodyB, physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, P_VEC_B);
        const waX = ENGINE_F32[P_VEC_A];
        const waY = ENGINE_F32[P_VEC_A + 1];
        const wbX = ENGINE_F32[P_VEC_B];
        const wbY = ENGINE_F32[P_VEC_B + 1];
        let bestOverlap = 0;
        let bestNx = 0;
        let bestNy = 0;
        let hasBest = false;
        for (let j = 0; j < linkWalls.used; j++) {
            const segId = linkWalls.buf[j];
            if (!linkSegmentOverlapsWall(waX, waY, wbX, wbY, capsuleRadius, segId)) continue;
            if (getLinkCapsuleSegmentPenetration(waX, waY, wbX, wbY, capsuleRadius, segId, { approachX, approachY })) {
                const nx = ENGINE_F32[P_OUT_PEN_NX];
                const ny = ENGINE_F32[P_OUT_PEN_NY];
                const overlap = ENGINE_F32[P_OUT_PEN_OVERLAP];
                if (overlap > 0 && (!hasBest || overlap > bestOverlap)) {
                    hasBest = true;
                    bestOverlap = overlap;
                    bestNx = nx;
                    bestNy = ny;
                }
            }
        }
        if (!hasBest) break;
        translateLinkAwayFromSlabWall(physIdA, physIdB, bestNx, bestNy, bestOverlap);
        wakeKineticBody(bodyA);
        wakeKineticBody(bodyB);
        spatialFrame.scheduleKineticActivation(bodyA);
        spatialFrame.scheduleKineticActivation(bodyB);
    }
}
function projectIslandLinkCapsulesAgainstWalls(spatialFrame) {
    const slab = kineticConstraintSlab;
    const islandWalls = islandLinkWallCandidates;
    const linkWalls = linkFilteredWallCandidates;
    const gatherMark = spatialFrame.frameId;
    let currentGroupStart = 0;
    for (let g = 0; g < slab.groupCount; g++) {
        const count = slab.groupCounts[g];
        const start = currentGroupStart;
        currentGroupStart += count;
        if (start >= slab.activeCount) break;
        gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, islandWalls);
        if (!islandWalls.used) continue;
        for (let pass = 0; pass < 2; pass++)
            for (let i = start; i < start + count; i++) {
                if (slab.type[i] === CONSTRAINT_TYPE_ANGLE) continue;
                if (!shouldProjectLinkCapsuleAgainstWalls(slab, i, slab.static.capsuleRadius[i], islandWalls, linkWalls)) continue;
                projectDistanceLinkCapsuleAgainstWalls(slab, i, linkWalls, spatialFrame);
            }
    }
}
function projectDistanceConstraint(slab, index) {
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const dynSlab = kineticDynamicSlab;
    worldAnchorFromSlab(constraintBodyAt(physIdA), physIdA, slab.static.anchorAx[index], slab.static.anchorAy[index], dynSlab, P_VEC_A);
    worldAnchorFromSlab(constraintBodyAt(physIdB), physIdB, slab.static.anchorBx[index], slab.static.anchorBy[index], dynSlab, P_VEC_B);
    const waX = ENGINE_F32[P_VEC_A];
    const waY = ENGINE_F32[P_VEC_A + 1];
    const wbX = ENGINE_F32[P_VEC_B];
    const wbY = ENGINE_F32[P_VEC_B + 1];
    const dx = wbX - waX;
    const dy = wbY - waY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - slab.static.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, -error);
}
function projectAngleConstraint(slab, index) {
    const bodyA = constraintBodyAt(slab.physIdA[index]);
    const bodyB = constraintBodyAt(slab.physIdB[index]);
    if (bodyA.isSleeping && bodyB.isSleeping) return;
    const facingA = entityFacing(bodyA);
    const facingB = entityFacing(bodyB);
    const refAngle = slab.static.referenceAngle[index];
    const error = normalizeAngle(facingB - facingA - refAngle);
    if (Math.abs(error) < 1e-4) return;
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    const sum = invIA + invIB;
    if (sum <= 1e-12) return;
    const ratioA = invIA / sum;
    const ratioB = invIB / sum;
    const correctionA = error * ratioA;
    const correctionB = error * ratioB;
    bodyA.facing = normalizeAngle(facingA + correctionA);
    bodyB.facing = normalizeAngle(facingB - correctionB);
    bodyA.stateTimer = (bodyA.stateTimer ?? 0) + 1;
    bodyB.stateTimer = (bodyB.stateTimer ?? 0) + 1;
    markBroadphaseDirty(bodyA);
    markBroadphaseDirty(bodyB);
}
function projectConstraint(slab, index) {
    if (slab.type[index] === CONSTRAINT_TYPE_ANGLE) projectAngleConstraint(slab, index);
    else projectDistanceConstraint(slab, index);
}
function solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.dynamic.k[index];
    if (k <= 1e-12) return 0;
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const bodyA = constraintBodyAt(physIdA);
    const bodyB = constraintBodyAt(physIdB);
    const dynSlab = kineticDynamicSlab;
    const nx = slab.dynamic.nx[index];
    const ny = slab.dynamic.ny[index];
    const rAn = slab.dynamic.rAn[index];
    const rBn = slab.dynamic.rBn[index];
    const error = slab.dynamic.error[index];
    const vAn = dynSlab.vx[physIdA] * nx + dynSlab.vy[physIdA] * ny + dynSlab.w[physIdA] * rAn;
    const vBn = dynSlab.vx[physIdB] * nx + dynSlab.vy[physIdB] * ny + dynSlab.w[physIdB] * rBn;
    const vRelN = vBn - vAn;
    const lambda = -(vRelN + velocityBias * error) / k;
    if (lambda === 0) return 0;
    slab.dynamic.accumulatedImpulse[index] += lambda;
    const invMassA = slab.static.invMassA[index];
    const invMassB = slab.static.invMassB[index];
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    dynSlab.vx[physIdA] -= lambda * nx * invMassA;
    dynSlab.vy[physIdA] -= lambda * ny * invMassA;
    dynSlab.vx[physIdB] += lambda * nx * invMassB;
    dynSlab.vy[physIdB] += lambda * ny * invMassB;
    dynSlab.w[physIdA] -= lambda * rAn * invIA;
    dynSlab.w[physIdB] += lambda * rBn * invIB;
    spatialFrame.scheduleKineticActivation(bodyA);
    spatialFrame.scheduleKineticActivation(bodyB);
    return Math.abs(lambda);
}
function solveAngleConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.dynamic.k[index];
    if (k <= 1e-12) return 0;
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const bodyA = constraintBodyAt(physIdA);
    const bodyB = constraintBodyAt(physIdB);
    const dynSlab = kineticDynamicSlab;
    const error = slab.dynamic.error[index];
    const vRelN = dynSlab.w[physIdB] - dynSlab.w[physIdA];
    const lambda = -(vRelN + velocityBias * error) / k;
    if (lambda === 0) return 0;
    slab.dynamic.accumulatedImpulse[index] += lambda;
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    dynSlab.w[physIdA] -= lambda * invIA;
    dynSlab.w[physIdB] += lambda * invIB;
    spatialFrame.scheduleKineticActivation(bodyA);
    spatialFrame.scheduleKineticActivation(bodyB);
    return Math.abs(lambda);
}
function solveConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    if (slab.type[index] === CONSTRAINT_TYPE_ANGLE) return solveAngleConstraintVelocity(slab, index, spatialFrame, velocityBias);
    else return solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias);
}
function projectKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    for (let i = 0; i < slab.activeCount; i += 2) projectConstraint(slab, i);
    for (let i = 1; i < slab.activeCount; i += 2) projectConstraint(slab, i);
}
function warmStartDistanceConstraint(slab, i, dynSlab) {
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    worldAnchorFromSlab(constraintBodyAt(physIdA), physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, P_VEC_A);
    worldAnchorFromSlab(constraintBodyAt(physIdB), physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, P_VEC_B);
    const waX = ENGINE_F32[P_VEC_A];
    const waY = ENGINE_F32[P_VEC_A + 1];
    const wbX = ENGINE_F32[P_VEC_B];
    const wbY = ENGINE_F32[P_VEC_B + 1];
    const dx = wbX - waX;
    const dy = wbY - waY;
    const dist = Math.hypot(dx, dy);
    let nx = 0,
        ny = 0,
        error = 0,
        rAn = 0,
        rBn = 0,
        k = 0;
    if (dist >= 1e-8) {
        nx = dx / dist;
        ny = dy / dist;
        error = dist - slab.static.restLength[i];
        const invMassA = slab.static.invMassA[i];
        const invMassB = slab.static.invMassB[i];
        const invIA = slab.static.invIA[i];
        const invIB = slab.static.invIB[i];
        const rax = waX - dynSlab.x[physIdA];
        const ray = waY - dynSlab.y[physIdA];
        const rbx = wbX - dynSlab.x[physIdB];
        const rby = wbY - dynSlab.y[physIdB];
        rAn = rax * ny - ray * nx;
        rBn = rbx * ny - rby * nx;
        k = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
    }
    slab.dynamic.nx[i] = nx;
    slab.dynamic.ny[i] = ny;
    slab.dynamic.error[i] = error;
    slab.dynamic.rAn[i] = rAn;
    slab.dynamic.rBn[i] = rBn;
    slab.dynamic.k[i] = k;
    const lambda = slab.dynamic.accumulatedImpulse[i];
    if (lambda !== 0 && dist >= 1e-8) {
        const invMassA = slab.static.invMassA[i];
        const invMassB = slab.static.invMassB[i];
        const invIA = slab.static.invIA[i];
        const invIB = slab.static.invIB[i];
        dynSlab.vx[physIdA] -= lambda * nx * invMassA;
        dynSlab.vy[physIdA] -= lambda * ny * invMassA;
        dynSlab.vx[physIdB] += lambda * nx * invMassB;
        dynSlab.vy[physIdB] += lambda * ny * invMassB;
        dynSlab.w[physIdA] -= lambda * rAn * invIA;
        dynSlab.w[physIdB] += lambda * rBn * invIB;
    }
}
function warmStartAngleConstraint(slab, i, dynSlab) {
    const bodyA = constraintBodyAt(slab.physIdA[i]);
    const bodyB = constraintBodyAt(slab.physIdB[i]);
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const facingA = entityFacing(bodyA);
    const facingB = entityFacing(bodyB);
    const refAngle = slab.static.referenceAngle[i];
    const error = normalizeAngle(facingB - facingA - refAngle);
    const invIA = slab.static.invIA[i];
    const invIB = slab.static.invIB[i];
    const k = invIA + invIB;
    slab.dynamic.nx[i] = 0;
    slab.dynamic.ny[i] = 0;
    slab.dynamic.error[i] = error;
    slab.dynamic.rAn[i] = 1;
    slab.dynamic.rBn[i] = 1;
    slab.dynamic.k[i] = k;
    const lambda = slab.dynamic.accumulatedImpulse[i];
    if (lambda !== 0) {
        dynSlab.w[physIdA] -= lambda * invIA;
        dynSlab.w[physIdB] += lambda * invIB;
    }
}
function warmStartConstraint(slab, i, dynSlab) {
    if (slab.type[i] === CONSTRAINT_TYPE_ANGLE) warmStartAngleConstraint(slab, i, dynSlab);
    else warmStartDistanceConstraint(slab, i, dynSlab);
}
function warmStartKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    for (let i = 0; i < slab.activeCount; i++) warmStartConstraint(slab, i, dynSlab);
}
function solveKineticConstraintSlab(spatialFrame, session) {
    const slab = kineticConstraintSlab;
    if (slab.activeCount === 0) return;
    const constraintSettings = collisionSettings.kineticConstraints;
    const { contactImpulseEpsilon } = collisionSettings.kineticEarlyOut;
    const store = kineticConstraintStore;
    warmStartKineticConstraintSlab();
    for (let iter = 0; iter < constraintSettings.iterations; iter++) {
        let maxImpulse = 0;
        for (let i = 0; i < slab.activeCount; i += 2) {
            const impulse = solveConstraintVelocity(slab, i, spatialFrame, constraintSettings.velocityBias);
            if (impulse > maxImpulse) maxImpulse = impulse;
        }
        for (let i = 1; i < slab.activeCount; i += 2) {
            const impulse = solveConstraintVelocity(slab, i, spatialFrame, constraintSettings.velocityBias);
            if (impulse > maxImpulse) maxImpulse = impulse;
        }
        if (maxImpulse <= contactImpulseEpsilon) break;
    }
    for (let i = 0; i < slab.activeCount; i++) store.accumulatedImpulse[slab.storeRow[i]] = slab.dynamic.accumulatedImpulse[i];
}
function gatheredConstraintSlabHasEvictedBodies(spatialFrame, slab) {
    for (let i = 0; i < slab.activeCount; i++) if (!constraintBodyAt(slab.physIdA[i]) || !constraintBodyAt(slab.physIdB[i])) return true;
    return false;
}
/** Collision substep: slab is authoritative pose; body synced only at pipeline boundaries. */
export function resolveGatheredKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    if (slab.count === 0) return;
    const spatialFrame = tick.frame;
    if (gatheredConstraintSlabHasEvictedBodies(spatialFrame, slab)) {
        gatherKineticConstraintSlab(tick);
        if (slab.count === 0) return;
    }
    projectKineticConstraintSlab();
    projectIslandLinkCapsulesAgainstWalls(spatialFrame);
    solveKineticConstraintSlab(spatialFrame, tick.world.kinetic);
}
export function measureConstraintSlabMaxError() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    let max = 0;
    for (let i = 0; i < slab.activeCount; i++) {
        if (slab.type[i] === CONSTRAINT_TYPE_ANGLE) continue;
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        worldAnchorFromSlab(constraintBodyAt(physIdA), physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, P_VEC_A);
        worldAnchorFromSlab(constraintBodyAt(physIdB), physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, P_VEC_B);
        const waX = ENGINE_F32[P_VEC_A];
        const waY = ENGINE_F32[P_VEC_A + 1];
        const wbX = ENGINE_F32[P_VEC_B];
        const wbY = ENGINE_F32[P_VEC_B + 1];
        const error = Math.abs(Math.hypot(wbX - waX, wbY - waY) - slab.static.restLength[i]);
        if (error > max) max = error;
    }
    return max;
}
function addAdjacencyEdge(adjacency, fromId, toId) {
    let neighbors = adjacency.get(fromId);
    if (!neighbors) {
        neighbors = [];
        adjacency.set(fromId, neighbors);
    }
    neighbors.push(toId);
}
function buildAdjacency(session) {
    const store = kineticConstraintStore;
    const adjacency = new Map();
    for (let i = 0; i < store.count; i++) {
        addAdjacencyEdge(adjacency, store.bodyAId[i], store.bodyBId[i]);
        addAdjacencyEdge(adjacency, store.bodyBId[i], store.bodyAId[i]);
    }
    return adjacency;
}
function getGraphCache(session) {
    const version = getKineticConstraintsVersion(session);
    let cache = session._kineticConstraintGraphCache;
    if (!cache || cache.version !== version) {
        cache = { version, adjacency: buildAdjacency(session), paths: new Map(), connectedIds: new Map(), islands: null };
        session._kineticConstraintGraphCache = cache;
    }
    return cache;
}
export function getKineticConstraintGraph(session) {
    return getGraphCache(session).adjacency;
}
export function getConnectedBodyIds(session, bodyId) {
    const cache = getGraphCache(session);
    if (cache.connectedIds.has(bodyId)) return cache.connectedIds.get(bodyId);
    const adjacency = cache.adjacency;
    const members = new Set([bodyId]);
    const stack = [bodyId];
    while (stack.length > 0) {
        const current = stack.pop();
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        for (let i = 0; i < neighbors.length; i++) {
            const next = neighbors[i];
            if (!members.has(next)) {
                members.add(next);
                stack.push(next);
            }
        }
    }
    const result = [...members];
    for (let i = 0; i < result.length; i++) cache.connectedIds.set(result[i], result);
    return result;
}
export function getConnectedComponentPath(session, endpointId) {
    const cache = getGraphCache(session);
    if (cache.paths.has(endpointId)) return cache.paths.get(endpointId);
    const adjacency = cache.adjacency;
    const ordered = [endpointId];
    const visited = new Set([endpointId]);
    let current = endpointId;
    while (true) {
        const neighbors = adjacency.get(current);
        let next = null;
        if (neighbors)
            for (let i = 0; i < neighbors.length; i++)
                if (!visited.has(neighbors[i])) {
                    next = neighbors[i];
                    break;
                }
        if (next == null) break;
        ordered.push(next);
        visited.add(next);
        current = next;
    }
    cache.paths.set(endpointId, ordered);
    return ordered;
}
export function areBodiesConnected(session, bodyAId, bodyBId) {
    if (bodyAId === bodyBId) return true;
    return getConnectedBodyIds(session, bodyAId).includes(bodyBId);
}
export function getConstraintIslands(session) {
    const cache = getGraphCache(session);
    if (cache.islands) return cache.islands;
    const adjacency = cache.adjacency;
    const seen = new Set();
    const islands = [];
    for (const startId of adjacency.keys()) {
        if (seen.has(startId)) continue;
        const island = [];
        const stack = [startId];
        seen.add(startId);
        while (stack.length > 0) {
            const current = stack.pop();
            island.push(current);
            const neighbors = adjacency.get(current);
            if (!neighbors) continue;
            for (let i = 0; i < neighbors.length; i++) {
                const next = neighbors[i];
                if (!seen.has(next)) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        islands.push(island);
    }
    cache.islands = islands;
    return islands;
}
export function markKineticConstraintsDirty(session) {
    session.kineticConstraintsDirty = true;
    session.kineticConstraintsVersion = (session.kineticConstraintsVersion ?? 0) + 1;
    bumpKineticTopologyGeneration(session);
}
export function getKineticConstraintsVersion(session) {
    return session.kineticConstraintsVersion ?? 0;
}
export function addDistanceConstraint(session, { bodyA, bodyB, anchorAx = 0, anchorAy = 0, anchorBx = 0, anchorBy = 0, restLength }) {
    const store = kineticConstraintStore;
    if (store.count >= MAX_KINETIC_CONSTRAINTS) throw new Error("kinetic constraint store capacity exceeded");
    const row = store.count++;
    store.id[row] = session.nextConstraintId++;
    store.type[row] = CONSTRAINT_TYPE_DISTANCE;
    store.bodyAId[row] = bodyA.id;
    store.bodyBId[row] = bodyB.id;
    store.physIdA[row] = bodyA._physId ?? -1;
    store.physIdB[row] = bodyB._physId ?? -1;
    store.anchorAx[row] = anchorAx;
    store.anchorAy[row] = anchorAy;
    store.anchorBx[row] = anchorBx;
    store.anchorBy[row] = anchorBy;
    store.restLength[row] = restLength;
    store.referenceAngle[row] = 0;
    store.accumulatedImpulse[row] = 0;
    markKineticConstraintsDirty(session);
    return row;
}
export function addAngleConstraint(session, { bodyA, bodyB, referenceAngle }) {
    const store = kineticConstraintStore;
    if (store.count >= MAX_KINETIC_CONSTRAINTS) throw new Error("kinetic constraint store capacity exceeded");
    const row = store.count++;
    store.id[row] = session.nextConstraintId++;
    store.type[row] = CONSTRAINT_TYPE_ANGLE;
    store.bodyAId[row] = bodyA.id;
    store.bodyBId[row] = bodyB.id;
    store.physIdA[row] = bodyA._physId ?? -1;
    store.physIdB[row] = bodyB._physId ?? -1;
    store.anchorAx[row] = 0;
    store.anchorAy[row] = 0;
    store.anchorBx[row] = 0;
    store.anchorBy[row] = 0;
    store.restLength[row] = 0;
    store.referenceAngle[row] = referenceAngle;
    store.accumulatedImpulse[row] = 0;
    markKineticConstraintsDirty(session);
    return row;
}
function swapRemoveConstraintRow(store, row) {
    const last = store.count - 1;
    if (row !== last) {
        store.id[row] = store.id[last];
        store.type[row] = store.type[last];
        store.bodyAId[row] = store.bodyAId[last];
        store.bodyBId[row] = store.bodyBId[last];
        store.physIdA[row] = store.physIdA[last];
        store.physIdB[row] = store.physIdB[last];
        store.anchorAx[row] = store.anchorAx[last];
        store.anchorAy[row] = store.anchorAy[last];
        store.anchorBx[row] = store.anchorBx[last];
        store.anchorBy[row] = store.anchorBy[last];
        store.restLength[row] = store.restLength[last];
        store.referenceAngle[row] = store.referenceAngle[last];
        store.accumulatedImpulse[row] = store.accumulatedImpulse[last];
    }
    store.count = last;
}
export function removeKineticConstraint(session, constraintId) {
    const store = kineticConstraintStore;
    for (let i = 0; i < store.count; i++) {
        if (store.id[i] !== constraintId) continue;
        swapRemoveConstraintRow(store, i);
        markKineticConstraintsDirty(session);
        return;
    }
}
export function clearKineticConstraints(session) {
    if (kineticConstraintStore.count === 0) return;
    kineticConstraintStore.count = 0;
    markKineticConstraintsDirty(session);
}
export function pruneKineticConstraintsForBody(session, bodyId) {
    const store = kineticConstraintStore;
    let changed = false;
    for (let i = store.count - 1; i >= 0; i--)
        if (store.bodyAId[i] === bodyId || store.bodyBId[i] === bodyId) {
            swapRemoveConstraintRow(store, i);
            changed = true;
        }
    if (changed) markKineticConstraintsDirty(session);
}
export function constraintCount(session) {
    return kineticConstraintStore.count;
}
export function collectKineticConstraintsSnapshot(session, propIdToIndex) {
    const entries = [];
    const store = kineticConstraintStore;
    for (let i = 0; i < store.count; i++) {
        const bodyA = propIdToIndex.get(store.bodyAId[i]);
        const bodyB = propIdToIndex.get(store.bodyBId[i]);
        if (bodyA == null || bodyB == null) continue;
        const entry = { type: store.type[i], bodyA, bodyB, accumulatedImpulse: store.accumulatedImpulse[i] };
        if (store.type[i] === CONSTRAINT_TYPE_ANGLE) entry.referenceAngle = store.referenceAngle[i];
        else {
            entry.restLength = store.restLength[i];
            entry.anchorAx = store.anchorAx[i];
            entry.anchorAy = store.anchorAy[i];
            entry.anchorBx = store.anchorBx[i];
            entry.anchorBy = store.anchorBy[i];
        }
        entries.push(entry);
    }
    return entries;
}
export function applyKineticConstraintsFromSnapshot(session, entries, propRefsByIndex) {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let type = entry.type;
        if (type === "angle") type = CONSTRAINT_TYPE_ANGLE;
        else if (type === "distance" || type == null) type = CONSTRAINT_TYPE_DISTANCE;
        let row;
        if (type === CONSTRAINT_TYPE_ANGLE) row = addAngleConstraint(session, { bodyA: propRefsByIndex[entry.bodyA], bodyB: propRefsByIndex[entry.bodyB], referenceAngle: entry.referenceAngle });
        else {
            const anchorAx = entry.anchorAx ?? entry.anchorA?.x ?? 0;
            const anchorAy = entry.anchorAy ?? entry.anchorA?.y ?? 0;
            const anchorBx = entry.anchorBx ?? entry.anchorB?.x ?? 0;
            const anchorBy = entry.anchorBy ?? entry.anchorB?.y ?? 0;
            row = addDistanceConstraint(session, { bodyA: propRefsByIndex[entry.bodyA], bodyB: propRefsByIndex[entry.bodyB], restLength: entry.restLength, anchorAx, anchorAy, anchorBx, anchorBy });
        }
        kineticConstraintStore.accumulatedImpulse[row] = entry.accumulatedImpulse || 0;
    }
}
export function getKineticTopologyGeneration(session) {
    return session.kineticTopologyGeneration ?? 0;
}
export function bumpKineticTopologyGeneration(session) {
    session.kineticTopologyGeneration = getKineticTopologyGeneration(session) + 1;
}
export function stampKineticPairGatherTopology(spatialFrame, session) {
    spatialFrame._kineticPairGatherTopologyGen = getKineticTopologyGeneration(session);
    spatialFrame._kineticTopologySession = session;
}
export function kineticPairTopologyStale(spatialFrame) {
    const gatherGen = spatialFrame._kineticPairGatherTopologyGen;
    if (gatherGen === undefined) return false;
    const session = spatialFrame._kineticTopologySession;
    if (!session) return false;
    return gatherGen !== getKineticTopologyGeneration(session);
}
export function worldAnchorFromBodyIntoF32(body, localX, localY, destOffset) {
    const angle = entityFacing(body);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ENGINE_F32[destOffset] = body.x + localX * cos - localY * sin;
    ENGINE_F32[destOffset + 1] = body.y + localX * sin + localY * cos;
}
export function worldAnchorFromSlab(body, physId, localX, localY, slab, destOffset) {
    const angle = entityFacing(body);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ENGINE_F32[destOffset] = slab.x[physId] + localX * cos - localY * sin;
    ENGINE_F32[destOffset + 1] = slab.y[physId] + localX * sin + localY * cos;
}
export const PAIR_KEY_SCALE = 1_000_000;
const WARM_START_FEATURE_STRIDE = 1024;
const FEATURE_ANGLE_BUCKETS = 32;
export function quantizeContactFeatureId(nx, ny) {
    if (nx === 0 && ny === 0) return 0;
    const angle = Math.atan2(ny, nx);
    let bucket = Math.round((angle / (Math.PI * 2)) * FEATURE_ANGLE_BUCKETS);
    if (bucket < 0) bucket += FEATURE_ANGLE_BUCKETS;
    if (bucket >= FEATURE_ANGLE_BUCKETS) bucket = 0;
    return bucket & 0x1f;
}
export function pairContactKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? bodyA.id * PAIR_KEY_SCALE + bodyB.id : bodyB.id * PAIR_KEY_SCALE + bodyA.id;
}
export function contactWarmStartKey(bodyA, bodyB, featureA = 0, featureB = 0) {
    const isAFirst = bodyA.id < bodyB.id;
    const f1 = isAFirst ? featureA : featureB;
    const f2 = isAFirst ? featureB : featureA;
    const featureKey = (f1 & 0x1f) | ((f2 & 0x1f) << 5);
    return pairContactKey(bodyA, bodyB) * WARM_START_FEATURE_STRIDE + featureKey;
}
export function contactWarmStartKeyFromPairKey(pairKey, featureA = 0, featureB = 0) {
    const featureKey = (featureA & 0x1f) | ((featureB & 0x1f) << 5);
    return pairKey * WARM_START_FEATURE_STRIDE + featureKey;
}
export function warmStartCacheIndex(warmStartKey) {
    return (Math.trunc(warmStartKey / PAIR_KEY_SCALE) ^ (warmStartKey % PAIR_KEY_SCALE)) & WARM_START_CACHE_MASK;
}
export function isRestingKineticContact(contacts, i, settings) {
    const resting = settings.kineticResting ?? {};
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const preN = contacts.dynamic.preDvx[i] * nx + contacts.dynamic.preDvy[i] * ny;
    const preT = contacts.dynamic.preDvx[i] * -ny + contacts.dynamic.preDvy[i] * nx;
    const normalEps = resting.normalVelocityEpsilon ?? 0.05;
    const tangentEps = resting.tangentVelocityEpsilon ?? 0.05;
    const velSlack = 1e-4;
    return Math.abs(preN) <= normalEps + velSlack && Math.abs(preT) <= tangentEps + velSlack;
}
const INNER_SOLVE_ITERATIONS = 4;
export function circleCircleContactSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    const dx = slab.x[physIdB] - slab.x[physIdA];
    const dy = slab.y[physIdB] - slab.y[physIdA];
    const distSq = dx * dx + dy * dy;
    const radii = slab.r[physIdA] + slab.r[physIdB];
    if (distSq >= radii * radii) return false;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) {
        SAT_RESULT[0] = radii;
        SAT_RESULT[1] = 0;
        SAT_RESULT[2] = 0;
        SAT_RESULT[5] = 1; // coincident
        return true;
    }
    const dist = Math.sqrt(distSq);
    SAT_RESULT[0] = radii - dist;
    SAT_RESULT[1] = dx / dist;
    SAT_RESULT[2] = dy / dist;
    SAT_RESULT[5] = 0; // coincident
    return true;
}
function warmStartCacheLookup(key) {
    let idx = warmStartCacheIndex(key);
    while (true) {
        if (warmStartGen[idx] !== warmStartState.generation) return -1;
        if (warmStartKeys[idx] === key) return idx;
        idx = (idx + 1) & WARM_START_CACHE_MASK;
    }
}
function applyCachedContactImpulse(contacts, i) {
    const slab = kineticDynamicSlab;
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const tx = -ny;
    const ty = nx;
    const jn = contacts.dynamic.jn[i];
    const jt = contacts.dynamic.jt[i];
    const invMassA = contacts.static.invMassA[i];
    const invMassB = contacts.static.invMassB[i];
    slab.vx[physIdA] -= jn * nx * invMassA - jt * tx * invMassA;
    slab.vy[physIdA] -= jn * ny * invMassA - jt * ty * invMassA;
    slab.vx[physIdB] += jn * nx * invMassB - jt * tx * invMassB;
    slab.vy[physIdB] += jn * ny * invMassB - jt * ty * invMassB;
    slab.w[physIdA] -= jn * contacts.dynamic.rAn[i] * contacts.static.invIA[i] - jt * contacts.dynamic.rAt[i] * contacts.static.invIA[i];
    slab.w[physIdB] += jn * contacts.dynamic.rBn[i] * contacts.static.invIB[i] - jt * contacts.dynamic.rBt[i] * contacts.static.invIB[i];
}
function warmStartKineticContacts(contacts) {
    const settings = collisionSettings;
    const decay = settings.kineticWarmStartDecay;
    let restingCount = 0;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        const cacheIdx = warmStartCacheLookup(key);
        if (cacheIdx === -1) {
            contacts.dynamic.jn[i] = 0;
            contacts.dynamic.jt[i] = 0;
        } else {
            contacts.dynamic.jn[i] = warmStartJn[cacheIdx] * decay;
            contacts.dynamic.jt[i] = warmStartJt[cacheIdx] * decay;
            applyCachedContactImpulse(contacts, i);
        }
        contacts.dynamic.resting[i] = isRestingKineticContact(contacts, i, settings) ? 1 : 0;
        if (contacts.dynamic.resting[i]) restingCount++;
    }
    return restingCount;
}
function storeKineticWarmStartCache(contacts) {
    warmStartState.generation++;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        let idx = warmStartCacheIndex(key);
        while (true) {
            if (warmStartGen[idx] !== warmStartState.generation || warmStartKeys[idx] === key) {
                warmStartGen[idx] = warmStartState.generation;
                warmStartKeys[idx] = key;
                warmStartJn[idx] = contacts.dynamic.jn[i];
                warmStartJt[idx] = contacts.dynamic.jt[i];
                break;
            }
            idx = (idx + 1) & WARM_START_CACHE_MASK;
        }
    }
}
function appendContact(contacts, pairs, pairIndex, nx, ny, rax, ray, rbx, rby, featureA = 0, featureB = 0) {
    if (contacts.count >= MAX_CONTACTS) return;
    const i = contacts.count++;
    contacts.physIdA[i] = pairs.physIdA[pairIndex];
    contacts.physIdB[i] = pairs.physIdB[pairIndex];
    contacts.static.tier[i] = pairs.static.tier[pairIndex];
    contacts.dynamic.nx[i] = nx;
    contacts.dynamic.ny[i] = ny;
    contacts.dynamic.rax[i] = rax;
    contacts.dynamic.ray[i] = ray;
    contacts.dynamic.rbx[i] = rbx;
    contacts.dynamic.rby[i] = rby;
    contacts.static.featureA[i] = featureA;
    contacts.static.featureB[i] = featureB;
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    contacts.dynamic.preDvx[i] = dynSlab.vx[contacts.physIdB[i]] - dynSlab.vx[contacts.physIdA[i]];
    contacts.dynamic.preDvy[i] = dynSlab.vy[contacts.physIdB[i]] - dynSlab.vy[contacts.physIdA[i]];
    const r1 = statSlab.restitution[contacts.physIdA[i]];
    const r2 = statSlab.restitution[contacts.physIdB[i]];
    if (r1 !== -1 && r2 !== -1) contacts.static.restitution[i] = (r1 + r2) * 0.5;
    else contacts.static.restitution[i] = r1 !== -1 ? r1 : r2 !== -1 ? r2 : collisionSettings.restitution.kineticPair;
    const f1 = statSlab.friction[contacts.physIdA[i]];
    const f2 = statSlab.friction[contacts.physIdB[i]];
    if (f1 !== -1 && f2 !== -1) contacts.static.friction[i] = Math.sqrt(f1 * f2);
    else contacts.static.friction[i] = f1 !== -1 ? f1 : f2 !== -1 ? f2 : collisionSettings.pairFriction;
    const idA = statSlab.entityId[contacts.physIdA[i]];
    const idB = statSlab.entityId[contacts.physIdB[i]];
    const warmStartPairKey = idA < idB ? idA * PAIR_BODY_KEY_SCALE + idB : idB * PAIR_BODY_KEY_SCALE + idA;
    contacts.static.warmStartKey[i] = contactWarmStartKeyFromPairKey(warmStartPairKey, featureA, featureB);
}
function narrowPhaseCircleContact(pairs, pairIndex, contacts) {
    const physIdA = pairs.physIdA[pairIndex];
    const physIdB = pairs.physIdB[pairIndex];
    if (!circleCircleContactSlab(physIdA, physIdB)) return;
    const overlap = SAT_RESULT[0];
    const nx = SAT_RESULT[1];
    const ny = SAT_RESULT[2];
    const coincident = SAT_RESULT[5] !== 0;
    if (coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap);
    const slab = kineticDynamicSlab;
    const rA = slab.r[physIdA];
    const rB = slab.r[physIdB];
    appendContact(contacts, pairs, pairIndex, nx, ny, -nx * rA, -ny * rA, nx * rB, ny * rB);
}
function narrowPhaseSatContact(pairs, pairIndex, contacts) {
    const physIdA = pairs.physIdA[pairIndex];
    const physIdB = pairs.physIdB[pairIndex];
    const slab = kineticDynamicSlab;
    const collided = checkPairCollisionAtSlabPose(physIdA, physIdB, slab.x[physIdA], slab.y[physIdA], slab.x[physIdB], slab.y[physIdB]);
    if (!collided) return;
    const overlap = SAT_RESULT[0];
    const nx = SAT_RESULT[1];
    const ny = SAT_RESULT[2];
    const coincident = SAT_RESULT[5] !== 0;
    if (coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap);
    const pointCount = SAT_RESULT[8];
    for (let p = 0; p < pointCount; p++) {
        const offset = 9 + p * 4;
        const cx = SAT_RESULT[offset + 0];
        const cy = SAT_RESULT[offset + 1];
        const featureA = SAT_RESULT[offset + 2];
        const featureB = SAT_RESULT[offset + 3];
        appendContact(contacts, pairs, pairIndex, nx, ny, cx - slab.x[physIdA], cy - slab.y[physIdA], cx - slab.x[physIdB], cy - slab.y[physIdB], featureA, featureB);
    }
}
function narrowPhaseKineticContacts(spatialFrame, pairs, contacts) {
    contacts.reset();
    for (let i = 0; i < pairs.count; i++) {
        const tier = pairs.static.tier[i];
        if (tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) narrowPhaseCircleContact(pairs, i, contacts);
        else narrowPhaseSatContact(pairs, i, contacts);
    }
}
function precomputeKineticContacts(spatialFrame, contacts) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const nx = contacts.dynamic.nx[i];
        const ny = contacts.dynamic.ny[i];
        let rax = contacts.dynamic.rax[i];
        let ray = contacts.dynamic.ray[i];
        let rbx = contacts.dynamic.rbx[i];
        let rby = contacts.dynamic.rby[i];
        const invMassA = statSlab.invMass[physIdA];
        const invMassB = statSlab.invMass[physIdB];
        const invIA = statSlab.invI[physIdA];
        const invIB = statSlab.invI[physIdB];
        const rAn = rax * ny - ray * nx;
        const rBn = rbx * ny - rby * nx;
        const rAt = rax * nx + ray * ny;
        const rBt = rbx * nx + rby * ny;
        contacts.static.invMassA[i] = invMassA;
        contacts.static.invMassB[i] = invMassB;
        contacts.static.invIA[i] = invIA;
        contacts.static.invIB[i] = invIB;
        contacts.dynamic.rAn[i] = rAn;
        contacts.dynamic.rBn[i] = rBn;
        contacts.dynamic.rAt[i] = rAt;
        contacts.dynamic.rBt[i] = rBt;
        contacts.static.kNormal[i] = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        contacts.static.kTangent[i] = invMassA + invMassB + rAt * rAt * invIA + rBt * rBt * invIB;
    }
}
function applyContactImpulse(contacts, i, slab, iterMaxImpulse) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const rax = contacts.dynamic.rax[i];
    const ray = contacts.dynamic.ray[i];
    const rbx = contacts.dynamic.rbx[i];
    const rby = contacts.dynamic.rby[i];
    const wA = slab.w[physIdA];
    const wB = slab.w[physIdB];
    const vAx = slab.vx[physIdA] - wA * ray;
    const vAy = slab.vy[physIdA] + wA * rax;
    const vBx = slab.vx[physIdB] - wB * rby;
    const vBy = slab.vy[physIdB] + wB * rbx;
    const velAlongNormal = (vBx - vAx) * nx + (vBy - vAy) * ny;
    let j = (-(1 + contacts.static.restitution[i]) * velAlongNormal) / contacts.static.kNormal[i];
    const oldJn = contacts.dynamic.jn[i];
    contacts.dynamic.jn[i] = Math.max(oldJn + j, 0);
    j = contacts.dynamic.jn[i] - oldJn;
    const invMassA = contacts.static.invMassA[i];
    const invMassB = contacts.static.invMassB[i];
    let maxImpulse = iterMaxImpulse;
    if (j !== 0) {
        maxImpulse = Math.max(maxImpulse, Math.abs(j));
        slab.vx[physIdA] -= j * nx * invMassA;
        slab.vy[physIdA] -= j * ny * invMassA;
        slab.vx[physIdB] += j * nx * invMassB;
        slab.vy[physIdB] += j * ny * invMassB;
        slab.w[physIdA] -= j * contacts.dynamic.rAn[i] * contacts.static.invIA[i];
        slab.w[physIdB] += j * contacts.dynamic.rBn[i] * contacts.static.invIB[i];
    }
    const tx = -ny;
    const ty = nx;
    const wAn = slab.w[physIdA];
    const wBn = slab.w[physIdB];
    const vAxT = slab.vx[physIdA] - wAn * ray;
    const vAyT = slab.vy[physIdA] + wAn * rax;
    const vBxT = slab.vx[physIdB] - wBn * rby;
    const vByT = slab.vy[physIdB] + wBn * rbx;
    const vt = (vAxT - vBxT) * tx + (vAyT - vByT) * ty;
    let jt = -vt / contacts.static.kTangent[i];
    const maxFriction = contacts.dynamic.jn[i] * contacts.static.friction[i];
    const oldJt = contacts.dynamic.jt[i];
    contacts.dynamic.jt[i] = Math.max(-maxFriction, Math.min(maxFriction, oldJt + jt));
    jt = contacts.dynamic.jt[i] - oldJt;
    if (jt === 0) return maxImpulse;
    maxImpulse = Math.max(maxImpulse, Math.abs(jt));
    slab.vx[physIdA] += jt * tx * invMassA;
    slab.vy[physIdA] += jt * ty * invMassA;
    slab.vx[physIdB] -= jt * tx * invMassB;
    slab.vy[physIdB] -= jt * ty * invMassB;
    slab.w[physIdA] += jt * contacts.dynamic.rAt[i] * contacts.static.invIA[i];
    slab.w[physIdB] -= jt * contacts.dynamic.rBt[i] * contacts.static.invIB[i];
    return maxImpulse;
}
function solveKineticContactVelocities(contacts, iterations, restingCount) {
    const slab = kineticDynamicSlab;
    const count = contacts.count;
    const { contactImpulseEpsilon } = collisionSettings.kineticEarlyOut;
    let iterationsRun = 0;
    let solveMaxImpulse = 0;
    for (let iter = 0; iter < iterations; iter++) {
        iterationsRun = iter + 1;
        let maxImpulse = 0;
        for (let i = 0; i < count; i++) {
            if (contacts.dynamic.resting[i] && iter > 0) continue;
            maxImpulse = applyContactImpulse(contacts, i, slab, maxImpulse);
        }
        solveMaxImpulse = Math.max(solveMaxImpulse, maxImpulse);
        if (maxImpulse <= contactImpulseEpsilon) break;
        if (restingCount === count && count > 0) break;
    }
    ENGINE_F32[P_OUT_SOLVE_ITERS] = iterationsRun;
    ENGINE_F32[P_OUT_SOLVE_IMPULSE] = solveMaxImpulse;
    ENGINE_F32[P_OUT_SOLVE_REST] = restingCount;
}
function applyKineticContactWake(contacts, spatialFrame) {
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = entityRefs[contacts.physIdA[i]]?._physId === contacts.physIdA[i] ? entityRefs[contacts.physIdA[i]] : null;
        const bodyB = entityRefs[contacts.physIdB[i]]?._physId === contacts.physIdB[i] ? entityRefs[contacts.physIdB[i]] : null;
        if (!bodyA || !bodyB) continue;
        invalidateWallResolveCache(bodyA, bodyB);
        spatialFrame.scheduleKineticActivation(bodyA);
        spatialFrame.scheduleKineticActivation(bodyB);
    }
}
export function gatherKineticContactPairs(tick) {
    const spatialFrame = tick.frame;
    refreshActiveKineticBodySlabPose(spatialFrame._activeKineticBodies);
    stampKineticPairGatherTopology(spatialFrame, tick.world.kinetic);
    const pairs = kineticPairBuffer;
    gatherKineticCandidatePairs(spatialFrame, pairs);
    return pairs;
}
function bumpPairGatherStat(session, field) {
    if (!session.kineticPairGatherStats) session.kineticPairGatherStats = { full: 0, refresh: 0, patch: 0 };
    session.kineticPairGatherStats[field]++;
}
export function ensureKineticContactPairs(tick, outPairs) {
    const session = tick.world.kinetic;
    const spatialFrame = tick.frame;
    if (!session.substepPairsValid || kineticPairTopologyStale(spatialFrame)) {
        gatherKineticContactPairs(tick);
        copyKineticPairBuffer(kineticPairBuffer, outPairs);
        session.substepPairsValid = true;
        bumpPairGatherStat(session, "full");
        return outPairs;
    }
    refreshActiveKineticBodySlabPose(spatialFrame._activeKineticBodies);
    stampKineticPairGatherTopology(spatialFrame, session);
    if (!compactSubstepKineticPairs(spatialFrame, outPairs)) {
        session.substepPairsValid = false;
        return ensureKineticContactPairs(tick, outPairs);
    }
    bumpPairGatherStat(session, "refresh");
    const patchBodies = session.substepPairPatchBodies;
    if (patchBodies?.length) {
        if (patchKineticPairsForBodies(spatialFrame, outPairs, patchBodies) > 0) bumpPairGatherStat(session, "patch");
        patchBodies.length = 0;
    }
    return outPairs;
}
function resetSleepContactBuffer() {
    sleepContactBuffer.count = 0;
    sleepContactBuffer._index.clear();
}
function addSleepContact(idA, idB, isResting) {
    const key = pairPhysKey(idA, idB);
    const existing = sleepContactBuffer._index.get(key);
    if (existing !== undefined) {
        if (isResting) sleepContactBuffer.resting[existing] = 1;
        return;
    }
    if (sleepContactBuffer.count < MAX_CONTACTS) {
        sleepContactBuffer._index.set(key, sleepContactBuffer.count);
        sleepContactBuffer.physIdA[sleepContactBuffer.count] = idA;
        sleepContactBuffer.physIdB[sleepContactBuffer.count] = idB;
        sleepContactBuffer.resting[sleepContactBuffer.count] = isResting ? 1 : 0;
        sleepContactBuffer.count++;
    }
}
const sKineticContactStats = { innerIterations: 0, maxImpulse: 0, restingCount: 0, contactCount: 0 };
const sKineticSolverStats = { outerIterations: 0, maxIterations: 0, pairCount: 0 };
export function resolveKineticContactPassWithPairs(tick, pairs) {
    const spatialFrame = tick.frame;
    const contacts = kineticContactBuffer;
    narrowPhaseKineticContacts(spatialFrame, pairs, contacts);
    if (contacts.count === 0) return contacts;
    precomputeKineticContacts(spatialFrame, contacts);
    const restingCount = warmStartKineticContacts(contacts);
    solveKineticContactVelocities(contacts, INNER_SOLVE_ITERATIONS, restingCount);
    sKineticContactStats.innerIterations = ENGINE_F32[P_OUT_SOLVE_ITERS];
    sKineticContactStats.maxImpulse = ENGINE_F32[P_OUT_SOLVE_IMPULSE];
    sKineticContactStats.restingCount = ENGINE_F32[P_OUT_SOLVE_REST];
    sKineticContactStats.contactCount = contacts.count;
    tick.world.kinetic.kineticContactStats = sKineticContactStats;
    storeKineticWarmStartCache(contacts);
    applyKineticContactWake(contacts, spatialFrame);
    for (let i = 0; i < contacts.count; i++) addSleepContact(contacts.physIdA[i], contacts.physIdB[i], contacts.dynamic.resting[i] === 1);
    return contacts;
}
export const KINETIC_PAIR_TIER = { CIRCLE_CIRCLE: 0, CIRCLE_POLY: 1, POLY_POLY: 2, COMPOUND: 3 };
export function classifyKineticPairTierSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    if (slab.partCount[physIdA] > 1 || slab.partCount[physIdB] > 1) return KINETIC_PAIR_TIER.COMPOUND;
    const kindA = slab.shapeKind[physIdA];
    const kindB = slab.shapeKind[physIdB];
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_CIRCLE) return KINETIC_PAIR_TIER.CIRCLE_CIRCLE;
    if (kindA === SHAPE_TYPE_CIRCLE || kindB === SHAPE_TYPE_CIRCLE) return KINETIC_PAIR_TIER.CIRCLE_POLY;
    return KINETIC_PAIR_TIER.POLY_POLY;
}
export function classifyKineticPairTier(bodyA, bodyB) {
    const physIdA = bodyA._physId;
    const physIdB = bodyB._physId;
    if (physIdA !== undefined && physIdA !== -1 && physIdB !== undefined && physIdB !== -1 && kineticDynamicSlab.partCount[physIdA] > 0 && kineticDynamicSlab.partCount[physIdB] > 0) return classifyKineticPairTierSlab(physIdA, physIdB);
    if (bodyA.collisionParts?.length > 1 || bodyB.collisionParts?.length > 1) return KINETIC_PAIR_TIER.COMPOUND;
    const shapeA = bodyA.collisionParts?.[0] ?? bodyA.shape;
    const shapeB = bodyB.collisionParts?.[0] ?? bodyB.shape;
    if (shapeA.shapeTypeId === SHAPE_TYPE_CIRCLE && shapeB.shapeTypeId === SHAPE_TYPE_CIRCLE) return KINETIC_PAIR_TIER.CIRCLE_CIRCLE;
    if (shapeA.shapeTypeId === SHAPE_TYPE_CIRCLE || shapeB.shapeTypeId === SHAPE_TYPE_CIRCLE) return KINETIC_PAIR_TIER.CIRCLE_POLY;
    return KINETIC_PAIR_TIER.POLY_POLY;
}
const PAIR_BODY_KEY_SCALE = 1_000_000;
function copyKineticPairBuffer(from, to) {
    to.count = from.count;
    for (let i = 0; i < from.count; i++) {
        to.physIdA[i] = from.physIdA[i];
        to.physIdB[i] = from.physIdB[i];
        to.static.tier[i] = from.static.tier[i];
    }
}
export function pairPhysKey(physIdA, physIdB) {
    return physIdA < physIdB ? physIdA * MAX_PHYS_BODIES + physIdB : physIdB * MAX_PHYS_BODIES + physIdA;
}
function clearPairHash() {
    pairHashKeys.fill(-1);
}
function addPairHash(key) {
    let idx = (key % PAIR_HASH_CAPACITY) | 0;
    while (true) {
        if (pairHashKeys[idx] === -1) {
            pairHashKeys[idx] = key;
            return true;
        }
        if (pairHashKeys[idx] === key) return false;
        idx = (idx + 1) % PAIR_HASH_CAPACITY;
    }
}
function hasPairHash(key) {
    let idx = (key % PAIR_HASH_CAPACITY) | 0;
    while (true) {
        if (pairHashKeys[idx] === -1) return false;
        if (pairHashKeys[idx] === key) return true;
        idx = (idx + 1) % PAIR_HASH_CAPACITY;
    }
}
export function compactSubstepKineticPairs(spatialFrame, pairs) {
    if (kineticPairTopologyStale(spatialFrame)) {
        pairs.count = 0;
        return false;
    }
    let write = 0;
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        if (areKineticLinkNeighborsSlab(physIdA, physIdB)) continue;
        const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
        if (!allowsKineticCollisionPairSlab(physIdA, physIdB, overlaps)) continue;
        if (write !== i) {
            pairs.physIdA[write] = physIdA;
            pairs.physIdB[write] = physIdB;
            pairs.static.tier[write] = pairs.static.tier[i];
        }
        write++;
    }
    pairs.count = write;
    return true;
}
export function patchKineticPairsForBodies(spatialFrame, pairs, bodies) {
    if (!bodies.length) return 0;
    bakeSpatialNeighborCsr(spatialFrame);
    clearPairHash();
    for (let i = 0; i < pairs.count; i++) addPairHash(pairPhysKey(pairs.physIdA[i], pairs.physIdB[i]));
    let added = 0;
    let seenCount = 0;
    const seenPrimary = spatialFrame._patchPrimarySeen;
    const seenPrimaryIds = spatialFrame._patchPrimarySeenIds;
    const slab = kineticDynamicSlab;
    const neighborEids = slab.spatialNeighborEids;
    for (let i = 0; i < bodies.length; i++) {
        const physIdA = bodies[i]._physId;
        if (physIdA === undefined) continue;
        if (seenPrimary[physIdA]) continue;
        seenPrimary[physIdA] = 1;
        seenPrimaryIds[seenCount++] = physIdA;
        const offset = slab.spatialNeighborOffset[physIdA];
        const neighborCount = slab.spatialNeighborCount[physIdA];
        for (let j = 0; j < neighborCount; j++) {
            const physIdB = neighborEids[offset + j];
            const key = pairPhysKey(physIdA, physIdB);
            if (hasPairHash(key)) continue;
            const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (!allowsKineticCollisionPairSlab(physIdA, physIdB, overlaps)) continue;
            if (areKineticLinkNeighborsSlab(physIdA, physIdB)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) {
                for (let k = 0; k < seenCount; k++) seenPrimary[seenPrimaryIds[k]] = 0;
                return added;
            }
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = classifyKineticPairTierSlab(physIdA, physIdB);
            addPairHash(key);
            added++;
        }
    }
    for (let k = 0; k < seenCount; k++) seenPrimary[seenPrimaryIds[k]] = 0;
    return added;
}
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    bakeSpatialNeighborCsr(spatialFrame);
    pairs.reset();
    const slab = kineticDynamicSlab;
    const neighborEids = slab.spatialNeighborEids;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physIdA = slab.activePhysIds[i];
        const offset = slab.spatialNeighborOffset[physIdA];
        const neighborCount = slab.spatialNeighborCount[physIdA];
        for (let j = 0; j < neighborCount; j++) {
            const physIdB = neighborEids[offset + j];
            const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (!allowsKineticCollisionPairSlab(physIdA, physIdB, overlaps)) continue;
            if (areKineticLinkNeighborsSlab(physIdA, physIdB)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) continue;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = classifyKineticPairTierSlab(physIdA, physIdB);
        }
    }
}
export function separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    const massA = statSlab.mass[physIdA];
    const massB = statSlab.mass[physIdB];
    const totalMass = massA + massB;
    dynSlab.x[physIdA] -= nx * overlap * (massB / totalMass);
    dynSlab.y[physIdA] -= ny * overlap * (massB / totalMass);
    dynSlab.x[physIdB] += nx * overlap * (massA / totalMass);
    dynSlab.y[physIdB] += ny * overlap * (massA / totalMass);
}
export function separateCoincidentCircleSlab(physIdA, physIdB, overlap) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    const massA = statSlab.mass[physIdA];
    const massB = statSlab.mass[physIdB];
    const totalMass = massA + massB;
    dynSlab.x[physIdA] -= overlap * (massB / totalMass);
    dynSlab.x[physIdB] += overlap * (massA / totalMass);
}
// Merged from collisionPipeline.js
function resolveActiveBodyWalls(activeBodies, spatialFrame, resolveWalls) {
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        const wallCandidates = spatialFrame.getWallCandidates(prop);
        if (!shouldResolveKineticBodyAgainstWalls(prop, wallCandidates)) continue;
        resolveWalls(prop);
    }
}
/** Kinetic collision substeps: contact solve + wall resolve. */
export function runCollisionPipeline(tick, resolveWalls, applyContactSideEffects, kineticIterations = collisionSettings.kineticIterations) {
    const spatialFrame = tick.frame;
    const { velocityEpsilonSq, constraintErrorEpsilon } = collisionSettings.kineticEarlyOut;
    const activeBodies = spatialFrame._activeKineticBodies;
    const hasActiveBodies = activeBodies.length > 0;
    let outerIterationsRun = 0;
    if (hasActiveBodies) {
        resetSleepContactBuffer();
        gatherKineticConstraintSlab(tick);
        ensureKineticContactPairs(tick, persistedKineticPairBuffer);
        const patchBodies = tick.world.kinetic.substepPairPatchBodies ?? (tick.world.kinetic.substepPairPatchBodies = []);
        for (let iter = 0; iter < kineticIterations; iter++) {
            outerIterationsRun = iter + 1;
            resolveKineticContactPassWithPairs(tick, persistedKineticPairBuffer);
            applyContactSideEffects?.(tick, kineticContactBuffer);
            resolveGatheredKineticConstraintSlab(tick);
            const maxError = measureConstraintSlabMaxError();
            const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
            const settled = maxError <= constraintErrorEpsilon && maxSpeedSq <= velocityEpsilonSq;
            if (!settled || iter === 0) resolveActiveBodyWalls(activeBodies, spatialFrame, resolveWalls);
            spatialFrame.flushScheduledKineticActivations(patchBodies);
            clampActiveKineticBodySlabSpeed(1000);
            if (settled) break;
        }
        writebackActiveKineticBodySlab(activeBodies);
        refreshActiveKineticBodySlabPose(activeBodies);
        sKineticSolverStats.outerIterations = outerIterationsRun;
        sKineticSolverStats.maxIterations = kineticIterations;
        sKineticSolverStats.pairCount = persistedKineticPairBuffer.count;
        tick.world.kinetic.kineticSolverStats = sKineticSolverStats;
    } else {
        sKineticSolverStats.outerIterations = 0;
        sKineticSolverStats.maxIterations = kineticIterations;
        sKineticSolverStats.pairCount = 0;
        tick.world.kinetic.kineticSolverStats = sKineticSolverStats;
    }
}
function applyKineticAcceleration(body, ax, ay, dtSec) {
    body.vx = (body.vx ?? 0) + ax * dtSec;
    body.vy = (body.vy ?? 0) + ay * dtSec;
    wakeKineticBody(body);
}
function applyFloorBeltForces(world, spatialFrame, dtMs) {
    const grid = world.obstacleGrid;
    if (grid.floorBeltCount === 0) return;
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies?.length) return;
    const dtSec = dtMs / 1000;
    const force = DEFAULT_FLOOR_BELT_FORCE;
    for (let i = 0; i < kineticBodies.length; i++) {
        const entity = kineticBodies[i];
        const idx = grid.worldToIdx(entity.x, entity.y);
        if (idx < 0) continue;
        const packed = grid.floorPacked[idx];
        if (!packed) continue;
        const cx = grid.gridCenterXByIdx(idx);
        const cy = grid.gridCenterYByIdx(idx);
        let ax = 0,
            ay = 0;
        const turn = BeltPacked.turn(packed);
        if (turn === 1) {
            const beltAngle = BeltPacked.flowAngle(packed);
            const flowX = Math.cos(beltAngle);
            const flowY = Math.sin(beltAngle);
            const normalX = -flowY;
            const normalY = flowX;
            const dispX = cx - entity.x;
            const dispY = cy - entity.y;
            const lateralOffset = dispX * normalX + dispY * normalY;
            const lateralForceMagnitude = (lateralOffset / grid.cellHalfSize) * force * 1.5;
            const v_lateral = (entity.vx || 0) * normalX + (entity.vy || 0) * normalY;
            const lateralDamping = -v_lateral * 5.0;
            ax = flowX * force + normalX * (lateralForceMagnitude + lateralDamping);
            ay = flowY * force + normalY * (lateralForceMagnitude + lateralDamping);
        } else {
            const pivotX = cx + BeltPacked.pivotDx(packed) * grid.cellHalfSize;
            const pivotY = cy + BeltPacked.pivotDy(packed) * grid.cellHalfSize;
            const dx = entity.x - pivotX;
            const dy = entity.y - pivotY;
            const dist = Math.hypot(dx, dy);
            const isLeft = turn === 0;
            let rX = 0,
                rY = 0,
                tX = 0,
                tY = 0;
            if (dist > 0.001) {
                rX = dx / dist;
                rY = dy / dist;
                tX = isLeft ? -rY : rY;
                tY = isLeft ? rX : -rX;
            } else {
                const angle = BeltPacked.flowAngle(packed);
                tX = Math.cos(angle);
                tY = Math.sin(angle);
            }
            const diff = dist - grid.cellHalfSize;
            const springForce = -(diff / (grid.cellHalfSize * 0.5)) * force * 1.5;
            const v_radial = (entity.vx || 0) * rX + (entity.vy || 0) * rY;
            const damping = -v_radial * 5.0;
            ax = tX * force + rX * (springForce + damping);
            ay = tY * force + rY * (springForce + damping);
        }
        applyKineticAcceleration(entity, ax, ay, dtSec);
    }
}
const PORTAL_TICK = { grid: null, spatialFrame: null, exitIdx: -1, exitCx: 0, exitCy: 0, tx: 0, ty: 0 };
function portalTeleportHandler(body) {
    const t = PORTAL_TICK;
    const grid = t.grid;
    if (grid.worldToIdx(body.x, body.y) !== t.exitIdx) {
        const r = resolveBodyRadius(body);
        const capture = grid.cellHalfSize + r;
        const dx = body.x - t.exitCx;
        const dy = body.y - t.exitCy;
        if (dx * dx + dy * dy > capture * capture) return;
    }
    body.x = t.tx;
    body.y = t.ty;
    body.vx = 0;
    body.vy = 0;
    body.angularVelocity = 0;
    delete body._groundRollDrive;
    if (body._physId !== undefined) snapshotKineticBodySlab([body]);
    const eg = t.spatialFrame.entityGrid;
    if (eg) {
        eg.remove(body);
        eg.insert(body);
        body._neighborsFrameId = -1;
        body._neighborEidCount = 0;
    }
    wakeKineticBody(body);
}
function applyFloorPortalTeleports(world, spatialFrame) {
    const grid = world.obstacleGrid;
    const count = grid.activePortalCount;
    if (count === 0) return;
    const pairs = grid.activePortalPairs;
    const eg = spatialFrame.entityGrid;
    const half = grid.cellHalfSize;
    for (let i = 0; i < count; i++) {
        const exitIdx = pairs[i * 2];
        const entryIdx = pairs[i * 2 + 1];
        const ex = grid.gridCenterXByIdx(exitIdx);
        const ey = grid.gridCenterYByIdx(exitIdx);
        const o = ENGINE_BOUNDS_BASE + B_QUERY;
        ENGINE_F32[o] = ex - half;
        ENGINE_F32[o + 2] = ex + half;
        ENGINE_F32[o + 1] = ey - half;
        ENGINE_F32[o + 3] = ey + half;
        PORTAL_TICK.grid = grid;
        PORTAL_TICK.spatialFrame = spatialFrame;
        PORTAL_TICK.exitIdx = exitIdx;
        PORTAL_TICK.exitCx = ex;
        PORTAL_TICK.exitCy = ey;
        PORTAL_TICK.tx = grid.gridCenterXByIdx(entryIdx);
        PORTAL_TICK.ty = grid.gridCenterYByIdx(entryIdx);
        eg.forEachInBoundsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY, null, ++eg.queryGen, portalTeleportHandler);
    }
}
export function runKineticPhysics(tick, dt, hooks) {
    const world = tick.world;
    world.simulationFrameHooks?.beforePhysics?.(world);
    const spatialFrame = tick.frame;
    applyFloorBeltForces(world, spatialFrame, dt);
    applyFloorPortalTeleports(world, spatialFrame);
    const session = world.kinetic;
    ensureKineticIslandPlan(session, spatialFrame._kineticBodies);
    session.kineticConstraintsDirty = false;
    session.substepPairsValid = false;
    session.substepPairPatchBodies = session.substepPairPatchBodies ?? [];
    session.substepPairPatchBodies.length = 0;
    session.kineticPairGatherStats = { full: 0, refresh: 0, patch: 0 };
    const kineticBodies = spatialFrame._kineticBodies;
    for (let i = 0; i < kineticBodies.length; i++) if (kineticBodies[i]._groundRollDrive) wakeKineticBody(kineticBodies[i]);
    spatialFrame.syncActiveKineticBodies();
    const activeBodies = spatialFrame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = collisionSettings.motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    const subDtSec = subDt / 1000;
    const { velocityEpsilonSq } = collisionSettings.kineticEarlyOut;
    let substepsRun = steps;
    const resolveWalls = (entity) => hooks.resolveWalls(entity, spatialFrame);
    for (let i = world.worldProps.length - 1; i >= 0; i--) hooks.updatePropFrame(world.worldProps[i], dt, spatialFrame);
    world.fractureEngine.debris.tickFrames(dt, spatialFrame);
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < activeBodies.length; i++) applyGroundRollDrive(activeBodies[i], subDtSec, world);
        for (let i = 0; i < activeBodies.length; i++) hooks.updatePropSubstep(activeBodies[i], subDt, spatialFrame);
        spatialFrame.reindexKineticBodies(activeBodies);
        runCollisionPipeline(tick, resolveWalls, hooks.applyContactSideEffects);
        const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
        const solverStats = world.kinetic.kineticSolverStats;
        const constraintsStable = !solverStats || solverStats.outerIterations < collisionSettings.kineticConstraints.iterations;
        if (s + 1 < steps && maxSpeedSq <= velocityEpsilonSq && constraintsStable) {
            substepsRun = s + 1;
            break;
        }
    }
    session.motionSubstepStats = { substepsRun, substepsPlanned: steps };
    advanceKineticSleepIslands(spatialFrame, session);
    spatialFrame.syncActiveKineticBodies();
    world.simulationFrameHooks?.afterPhysics?.(world);
    hooks.afterKineticPhysics?.(tick, dt);
}
/**
 * Adaptive physics substep count from peak kinetic body displacement this tick.
 * Used by {@link runKineticPhysics}.
 *
 * @param {number} dtMs
 * @param {object[] | null | undefined} bodies
 * @param {{ maxStepPx?: number, maxSubsteps?: number }} [opts]
 * @returns {number}
 */
export function countMotionSubsteps(dtMs, bodies, { maxStepPx = 4, maxSubsteps = 8 } = {}) {
    if (!bodies?.length || dtMs <= 0 || maxStepPx <= 0) return 1;
    const dtSec = dtMs / 1000;
    let maxDisp = 0;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.isSleeping) continue;
        const disp = lengthXY(body.vx ?? 0, body.vy ?? 0) * dtSec;
        if (disp > maxDisp) maxDisp = disp;
    }
    if (maxDisp <= 1e-6) return 1;
    return Math.min(maxSubsteps, Math.max(1, Math.ceil(maxDisp / maxStepPx)));
}
/** @param {object[] | null | undefined} bodies */
export function maxActiveKineticSpeedSq(bodies) {
    let max = 0;
    if (!bodies?.length) return max;
    for (let i = 0; i < bodies.length; i++) {
        const vx = bodies[i].vx ?? 0;
        const vy = bodies[i].vy ?? 0;
        const sq = vx * vx + vy * vy;
        if (sq > max) max = sq;
    }
    return max;
}
function clearBodyIslandFields(body) {
    delete body._kineticIslandPeers;
    delete body._kineticIslandRoot;
    const physId = body._physId;
    if (physId !== undefined && physId !== -1) {
        kineticDynamicSlab.linkNeighborOffset[physId] = 0;
        kineticDynamicSlab.linkNeighborCount[physId] = 0;
        kineticDynamicSlab.islandRoot[physId] = -1;
    }
}
function ensureLinkNeighborArena(needed) {
    ensureGrowI32(kineticDynamicSlab, "linkNeighborEids", needed, kineticDynamicSlab.linkNeighborEidsUsed);
}
function sortLinkNeighborSlice(offset, count) {
    if (count <= 1) return;
    const arena = kineticDynamicSlab.linkNeighborEids;
    for (let i = offset + 1; i < offset + count; i++) {
        const key = arena[i];
        let j = i - 1;
        while (j >= offset && arena[j] > key) {
            arena[j + 1] = arena[j];
            j--;
        }
        arena[j + 1] = key;
    }
}
export function resetKineticLinkNeighborArena() {
    kineticDynamicSlab.linkNeighborEidsUsed = 0;
}
export function writeKineticLinkNeighbors(physId, neighborPhysIds) {
    const slab = kineticDynamicSlab;
    if (!neighborPhysIds || neighborPhysIds.length === 0) {
        slab.linkNeighborOffset[physId] = 0;
        slab.linkNeighborCount[physId] = 0;
        return;
    }
    ensureLinkNeighborArena(slab.linkNeighborEidsUsed + neighborPhysIds.length);
    const offset = slab.linkNeighborEidsUsed;
    let count = 0;
    for (let i = 0; i < neighborPhysIds.length; i++) {
        const n = neighborPhysIds[i];
        if (n === undefined || n === -1) continue;
        slab.linkNeighborEids[offset + count++] = n;
    }
    sortLinkNeighborSlice(offset, count);
    slab.linkNeighborOffset[physId] = offset;
    slab.linkNeighborCount[physId] = count;
    slab.linkNeighborEidsUsed = offset + count;
}
export function bakeKineticIslandPlan(session, kineticBodies) {
    const adjacent = getGraphCache(session).adjacency;
    const bodyById = new Map();
    resetKineticLinkNeighborArena();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        bodyById.set(body.id, body);
        clearBodyIslandFields(body);
    }
    const constraints = kineticConstraintStore;
    for (let i = 0; i < constraints.count; i++) {
        const a = bodyById.get(constraints.bodyAId[i]);
        const b = bodyById.get(constraints.bodyBId[i]);
        constraints.physIdA[i] = a?._physId ?? -1;
        constraints.physIdB[i] = b?._physId ?? -1;
    }
    const slab = kineticDynamicSlab;
    const neighborScratch = [];
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const neighborIds = adjacent.get(body.id);
        neighborScratch.length = 0;
        if (neighborIds)
            for (let j = 0; j < neighborIds.length; j++) {
                const neighbor = bodyById.get(neighborIds[j]);
                if (!neighbor || neighbor._physId === undefined || neighbor._physId === -1) continue;
                neighborScratch.push(neighbor._physId);
            }
        writeKineticLinkNeighbors(physId, neighborScratch);
    }
    const assigned = new Set();
    for (let i = 0; i < kineticBodies.length; i++) {
        const start = kineticBodies[i];
        if (assigned.has(start.id)) continue;
        const memberBodies = [];
        const seen = new Set([start.id]);
        const stack = [start.id];
        while (stack.length > 0) {
            const id = stack.pop();
            const body = bodyById.get(id);
            if (body) memberBodies.push(body);
            const neighborIds = adjacent.get(id);
            if (!neighborIds) continue;
            for (let k = 0; k < neighborIds.length; k++) {
                const neighborId = neighborIds[k];
                if (!seen.has(neighborId)) {
                    seen.add(neighborId);
                    stack.push(neighborId);
                }
            }
        }
        const root = memberBodies[0].id;
        const multiBody = memberBodies.length > 1;
        for (let m = 0; m < memberBodies.length; m++) {
            const body = memberBodies[m];
            assigned.add(body.id);
            body._kineticIslandRoot = root;
            if (body._physId !== undefined) slab.islandRoot[body._physId] = root;
            if (multiBody) body._kineticIslandPeers = memberBodies;
        }
    }
    session._kineticIslandPlan = { version: getKineticConstraintsVersion(session) };
}
export function ensureKineticIslandPlan(session, kineticBodies) {
    const version = getKineticConstraintsVersion(session);
    const plan = session._kineticIslandPlan;
    if (plan && plan.version === version) return plan;
    bakeKineticIslandPlan(session, kineticBodies);
    return session._kineticIslandPlan;
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function areKineticLinkNeighborsSlab(physIdA, physIdB) {
    const count = kineticDynamicSlab.linkNeighborCount[physIdA];
    if (count === 0) return false;
    const offset = kineticDynamicSlab.linkNeighborOffset[physIdA];
    const arena = kineticDynamicSlab.linkNeighborEids;
    if (count <= 4) {
        for (let i = 0; i < count; i++) if (arena[offset + i] === physIdB) return true;
        return false;
    }
    let lo = offset;
    let hi = offset + count - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const v = arena[mid];
        if (v === physIdB) return true;
        if (v < physIdB) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}
export function areKineticLinkNeighbors(bodyA, bodyB) {
    const physIdA = bodyA._physId;
    const physIdB = bodyB._physId;
    if (physIdA === undefined || physIdA === -1 || physIdB === undefined || physIdB === -1) return false;
    return areKineticLinkNeighborsSlab(physIdA, physIdB);
}
function find(i) {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
        let nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
    }
    return root;
}
function union(i, j) {
    let rootI = find(i);
    let rootJ = find(j);
    if (rootI !== rootJ)
        if (rank[rootI] < rank[rootJ]) parent[rootI] = rootJ;
        else if (rank[rootI] > rank[rootJ]) parent[rootJ] = rootI;
        else {
            parent[rootJ] = rootI;
            rank[rootI]++;
        }
}
const bodyByPhysId = new Array(MAX_PHYS_BODIES);
export function advanceKineticSleepIslands(frame, session, contacts = sleepContactBuffer) {
    const activeBodies = frame._activeKineticBodies;
    if (!activeBodies || activeBodies.length === 0) return;
    parent.fill(-1);
    rank.fill(0);
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        parent[physId] = physId;
        bodyByPhysId[physId] = body;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const peers = body._kineticIslandPeers;
        if (peers)
            for (let j = 0; j < peers.length; j++) {
                const peer = peers[j];
                if (peer === body) continue;
                const peerPhysId = peer._physId;
                if (peerPhysId === undefined || peerPhysId === -1) continue;
                if (parent[peerPhysId] === -1) parent[peerPhysId] = peerPhysId;
                union(physId, peerPhysId);
            }
    }
    if (contacts && contacts.count > 0)
        for (let i = 0; i < contacts.count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            if (parent[physIdA] === -1 || parent[physIdB] === -1) continue;
            const bodyA = bodyByPhysId[physIdA];
            const bodyB = bodyByPhysId[physIdB];
            if (!bodyA || !bodyB) continue;
            const isResting = contacts.resting[i] === 1;
            const eitherActive = isKinematicallyActive(bodyA) || isKinematicallyActive(bodyB);
            if (isResting || eitherActive) union(physIdA, physIdB);
        }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = find(physId);
        componentRoot[physId] = root;
        componentMaxSpeedSq[root] = 0;
        componentHasBlocker[root] = 0;
        componentMemberCount[root] = 0;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = componentRoot[physId];
        const vx = body.vx || 0;
        const vy = body.vy || 0;
        const speedSq = vx * vx + vy * vy;
        if (speedSq > componentMaxSpeedSq[root]) componentMaxSpeedSq[root] = speedSq;
        if (!canSleepKinetic(body)) componentHasBlocker[root] = 1;
        componentMemberCount[root]++;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = componentRoot[physId];
        const eligible = componentHasBlocker[root] === 0;
        advanceKineticSleep(body, eligible);
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const physId = activeBodies[i]._physId;
        if (physId !== undefined && physId !== -1) bodyByPhysId[physId] = undefined;
    }
}
export function kineticSleepFramesRequired() {
    return collisionSettings.kineticSleep.frames;
}
function propBlocksSleep(prop) {
    const fn = prop.currentState?.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
export function canSleepKinetic(entity) {
    if (!entity?.strategy?.isKinetic) return false;
    if (propBlocksSleep(entity)) return false;
    return !isKinematicallyActive(entity);
}
export function wakeKineticBody(entity) {
    if (!entity?.strategy?.isKinetic) return;
    if (!entity.isSleeping && entity._sleepFrames === 0) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
    const physId = entity._physId;
    if (physId !== undefined && physId !== -1) {
        const count = kineticDynamicSlab.linkNeighborCount[physId];
        if (count > 0) {
            const offset = kineticDynamicSlab.linkNeighborOffset[physId];
            for (let i = 0; i < count; i++) {
                const peer = constraintBodyAt(kineticDynamicSlab.linkNeighborEids[offset + i]);
                if (!peer || peer === entity) continue;
                peer._sleepFrames = 0;
                peer.isSleeping = false;
            }
            return;
        }
    }
    const peers = entity._kineticIslandPeers;
    if (!peers) return;
    for (let i = 0; i < peers.length; i++) {
        const peer = peers[i];
        if (peer === entity) continue;
        peer._sleepFrames = 0;
        peer.isSleeping = false;
    }
}
export function advanceKineticSleep(entity, eligible, requiredFrames = kineticSleepFramesRequired()) {
    if (!entity?.strategy?.isKinetic) return;
    if (!eligible) {
        entity._sleepFrames = 0;
        entity.isSleeping = false;
        return;
    }
    entity._sleepFrames++;
    if (entity._sleepFrames >= requiredFrames) entity.isSleeping = true;
}
export function hasSleepBlockingNeighbor(prop, neighborEids, neighborCount = neighborEids.length) {
    const propEid = prop._physId;
    for (let i = 0; i < neighborCount; i++) {
        const eidB = neighborEids[i];
        if (eidB === propEid) continue;
        const other = entityRefs[eidB];
        if (!other?.strategy?.isKinetic) continue;
        if (shareKineticIsland(prop, other)) continue;
        if (!pairBroadphaseOverlapSlab(propEid, eidB)) continue;
        if (other.isSleeping) continue;
        if (isKinematicallyActive(other)) return true;
    }
    return false;
}
export function evaluateKineticSleepEligible(prop, neighborEids, neighborCount = neighborEids.length) {
    return canSleepKinetic(prop) && !hasSleepBlockingNeighbor(prop, neighborEids, neighborCount);
}
export function evaluateKineticIslandSleepEligible(islandMembers, spatialFrame) {
    emptyAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY);
    for (let i = 0; i < islandMembers.length; i++) {
        const prop = islandMembers[i];
        if (!canSleepKinetic(prop)) return false;
        const extent = entityCollisionSpan(prop);
        growAabbFromCenterF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY, prop.x, prop.y, extent, extent);
    }
    const eg = spatialFrame.entityGrid;
    padAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_PAD, ENGINE_F32, ENGINE_BOUNDS_BASE + B_QUERY, eg.maxInsertedExtent + neighborQueryPadForExtent(Number.MAX_SAFE_INTEGER));
    let n = spatialFrame.collectEntityEidsInBoundsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_PAD, kineticSleepScratch.neighborEids, kineticSleepScratch.neighborEids.length);
    while (n < 0) {
        ensureGrowI32(kineticSleepScratch, "neighborEids", kineticSleepScratch.neighborEids.length * 2);
        n = spatialFrame.collectEntityEidsInBoundsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_PAD, kineticSleepScratch.neighborEids, kineticSleepScratch.neighborEids.length);
    }
    for (let i = 0; i < islandMembers.length; i++) if (hasSleepBlockingNeighbor(islandMembers[i], kineticSleepScratch.neighborEids, n)) return false;
    return true;
}
/**
 * Velocity and angular drag for coasting / knockback decay (top-down locomotion).
 */
/**
 * @typedef {object} DampedBody
 * @property {number} x
 * @property {number} y
 * @property {number} [vx]
 * @property {number} [vy]
 * @property {number} [facing]
 * @property {number} [angularVelocity]
 */
/**
 * @param {DampedBody} body — mutated in place
 * @param {number} dtMs
 * @param {{ friction?: number, integrateFacing?: boolean, snapSpeed?: number }} [options]
 */
export function applyVelocityDamping(body, dtMs, { friction = 8.0, integrateFacing = true, snapSpeed = 1 } = {}) {
    if (body.vx || body.vy) {
        addXY(body, (body.vx ?? 0) * (dtMs / 1000), (body.vy ?? 0) * (dtMs / 1000));
        const dragFactor = Math.exp(-friction * (dtMs / 1000));
        body.vx = (body.vx ?? 0) * dragFactor;
        body.vy = (body.vy ?? 0) * dragFactor;
        if (lengthXY(body.vx, body.vy) < snapSpeed) {
            body.vx = 0;
            body.vy = 0;
        }
    }
    if (integrateFacing && body.angularVelocity) {
        body.facing = entityFacing(body) + body.angularVelocity * (dtMs / 1000);
        const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
        body.angularVelocity *= angularDrag;
        if (Math.abs(body.angularVelocity) < 0.1) body.angularVelocity = 0;
    }
}
/**
 * Two-body impulse exchange at a SAT contact (kinetic prop pairs).
 *
 * @param {{
 *   x: number, y: number,
 *   vx?: number, vy?: number,
 *   angularVelocity?: number,
 *   mass?: number, radius?: number,
 *   momentOfInertia?: number,
 * }} p1 — mutated in place
 * @param {typeof p1} p2 — mutated in place
 * @param {{ nx: number, ny: number, overlap: number, cx?: number, cy?: number }} collisionInfo
 * @param {number} [restitution]
 */
/** Ground-plane corners of a wall segment prism (rotated square). */
export function toSegmentLocal(segId, x, y) {
    const slab = staticWallSegmentSlab;
    const dx = x - slab.x[segId];
    const dy = y - slab.y[segId];
    const angle = slab.angle[segId];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const halfX = slab.width[segId] * 0.5;
    const halfY = slab.height[segId] * 0.5;
    ENGINE_F32[P_VEC_A] = halfX;
    ENGINE_F32[P_VEC_A + 1] = halfY;
    ENGINE_F32[P_VEC_B] = dx * cos - dy * sin;
    ENGINE_F32[P_VEC_B + 1] = dx * sin + dy * cos;
}
export function closestPointOnSegment(segId, x, y) {
    const slab = staticWallSegmentSlab;
    const halfX = slab.width[segId] * 0.5;
    const halfY = slab.height[segId] * 0.5;
    const angle = slab.angle[segId];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const wx = slab.x[segId];
    const wy = slab.y[segId];
    const localX = (x - wx) * cos - (y - wy) * sin;
    const localY = (x - wx) * sin + (y - wy) * cos;
    const closestLocalX = Math.max(-halfX, Math.min(localX, halfX));
    const closestLocalY = Math.max(-halfY, Math.min(localY, halfY));
    const invCos = Math.cos(angle);
    const invSin = Math.sin(angle);
    ENGINE_F32[P_OUT_DIST_X] = wx + closestLocalX * invCos - closestLocalY * invSin;
    ENGINE_F32[P_OUT_DIST_Y] = wy + closestLocalX * invSin + closestLocalY * invCos;
}
export function distanceSqToSegment(segId, x, y) {
    const slab = staticWallSegmentSlab;
    const dx = x - slab.x[segId];
    const dy = y - slab.y[segId];
    const angle = slab.angle[segId];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const halfX = slab.width[segId] * 0.5;
    const halfY = slab.height[segId] * 0.5;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const closestX = Math.max(-halfX, Math.min(localX, halfX));
    const closestY = Math.max(-halfY, Math.min(localY, halfY));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    return distDX * distDX + distDY * distDY;
}
export function distanceToSegment(segId, x, y) {
    const distSq = distanceSqToSegment(segId, x, y);
    return distSq === Infinity ? Infinity : Math.sqrt(distSq);
}
function segmentIntersectsAabb(ax, ay, bx, by, minX, minY, maxX, maxY) {
    let codeA = 0;
    if (ax < minX) codeA |= 1;
    else if (ax > maxX) codeA |= 2;
    if (ay < minY) codeA |= 4;
    else if (ay > maxY) codeA |= 8;
    let codeB = 0;
    if (bx < minX) codeB |= 1;
    else if (bx > maxX) codeB |= 2;
    if (by < minY) codeB |= 4;
    else if (by > maxY) codeB |= 8;
    if ((codeA | codeB) === 0) return true;
    if ((codeA & codeB) !== 0) return false;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx !== 0) {
        let t = (minX - ax) / dx;
        if (t >= 0 && t <= 1) {
            let y = ay + t * dy;
            if (y >= minY && y <= maxY) return true;
        }
        t = (maxX - ax) / dx;
        if (t >= 0 && t <= 1) {
            let y = ay + t * dy;
            if (y >= minY && y <= maxY) return true;
        }
    }
    if (dy !== 0) {
        let t = (minY - ay) / dy;
        if (t >= 0 && t <= 1) {
            let x = ax + t * dx;
            if (x >= minX && x <= maxX) return true;
        }
        t = (maxY - ay) / dy;
        if (t >= 0 && t <= 1) {
            let x = ax + t * dx;
            if (x >= minX && x <= maxX) return true;
        }
    }
    return false;
}
function minDistanceSegmentToAabb(ax, ay, bx, by, minX, minY, maxX, maxY) {
    if (segmentIntersectsAabb(ax, ay, bx, by, minX, minY, maxX, maxY)) return 0;
    const distA = distanceToAabb(ax, ay, minX, minY, maxX, maxY);
    const distB = distanceToAabb(bx, by, minX, minY, maxX, maxY);
    let minSq = Math.min(distA * distA, distB * distB, distanceSqToLineSegment(minX, minY, ax, ay, bx, by), distanceSqToLineSegment(maxX, minY, ax, ay, bx, by), distanceSqToLineSegment(maxX, maxY, ax, ay, bx, by), distanceSqToLineSegment(minX, maxY, ax, ay, bx, by));
    return Math.sqrt(minSq);
}
/** Minimum distance between a path segment and a wall's collision box. */
export function minDistanceSegmentToWall(ax, ay, bx, by, segId) {
    const slab = staticWallSegmentSlab;
    const halfX = slab.width[segId] * 0.5;
    const halfY = slab.height[segId] * 0.5;
    const angle = slab.angle[segId];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const wx = slab.x[segId];
    const wy = slab.y[segId];
    ENGINE_F32[P_VEC_A] = (ax - wx) * cos - (ay - wy) * sin;
    ENGINE_F32[P_VEC_A + 1] = (ax - wx) * sin + (ay - wy) * cos;
    ENGINE_F32[P_VEC_B] = (bx - wx) * cos - (by - wy) * sin;
    ENGINE_F32[P_VEC_B + 1] = (bx - wx) * sin + (by - wy) * cos;
    return minDistanceSegmentToAabb(ENGINE_F32[P_VEC_A], ENGINE_F32[P_VEC_A + 1], ENGINE_F32[P_VEC_B], ENGINE_F32[P_VEC_B + 1], -halfX, -halfY, halfX, halfY);
}
/** Closest point on path segment AB to wall box — used for push direction. */
export function findClosestPointOnPathToWall(ax, ay, bx, by, segId) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.01) {
        ENGINE_F32[P_OUT_DIST_X] = ax;
        ENGINE_F32[P_OUT_DIST_Y] = ay;
        ENGINE_F32[P_OUT_DIST_T] = 0;
        ENGINE_F32[P_OUT_DIST_DIST] = distanceToSegment(segId, ax, ay);
        return;
    }
    const samples = Math.min(256, Math.max(16, Math.ceil(segLen)));
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const dist = distanceToSegment(segId, px, py);
        if (dist < bestDist) {
            bestDist = dist;
            bestT = t;
        }
    }
    let lo = Math.max(0, bestT - 1 / samples);
    let hi = Math.min(1, bestT + 1 / samples);
    for (let i = 0; i < 10; i++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        const d1 = distanceToSegment(segId, ax + (bx - ax) * m1, ay + (by - ay) * m1);
        const d2 = distanceToSegment(segId, ax + (bx - ax) * m2, ay + (by - ay) * m2);
        if (d1 < d2) hi = m2;
        else lo = m1;
    }
    const t = (lo + hi) / 2;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    ENGINE_F32[P_OUT_DIST_X] = x;
    ENGINE_F32[P_OUT_DIST_Y] = y;
    ENGINE_F32[P_OUT_DIST_T] = t;
    ENGINE_F32[P_OUT_DIST_DIST] = distanceToSegment(segId, x, y);
}
export function circleIntersectsSegment(circle, segId) {
    const radiusSq = circle.radius * circle.radius;
    return distanceSqToSegment(segId, circle.x, circle.y) < radiusSq;
}
/**
 * Closest point on an axis-aligned box boundary (segment-local space).
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} halfX
 * @param {number} halfY
 */
function closestPointOnLocalBoxSurface(localX, localY, halfX, halfY) {
    const insideX = localX > -halfX && localX < halfX;
    const insideY = localY > -halfY && localY < halfY;
    if (!insideX || !insideY) {
        const outX = Math.max(-halfX, Math.min(localX, halfX));
        const outY = Math.max(-halfY, Math.min(localY, halfY));
        ENGINE_F32[P_VEC_A] = outX;
        ENGINE_F32[P_VEC_A + 1] = outY;
        return;
    }
    const distToLeft = localX + halfX;
    const distToRight = halfX - localX;
    const distToTop = localY + halfY;
    const distToBottom = halfY - localY;
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    const eps = 1e-6;
    let outX = localX;
    let outY = localY;
    if (Math.abs(minDist - distToLeft) <= eps) outX = -halfX;
    if (Math.abs(minDist - distToRight) <= eps) outX = halfX;
    if (Math.abs(minDist - distToTop) <= eps) outY = -halfY;
    if (Math.abs(minDist - distToBottom) <= eps) outY = halfY;
    ENGINE_F32[P_VEC_A] = outX;
    ENGINE_F32[P_VEC_A + 1] = outY;
}
/**
 * Outward push normal for a point on an axis-aligned box surface (segment-local space).
 *
 * @param {number} sx
 * @param {number} sy
 * @param {number} halfX
 * @param {number} halfY
 */
function pushNormalAtLocalBoxSurface(sx, sy, halfX, halfY) {
    const eps = 1e-4;
    let nx = 0;
    let ny = 0;
    if (Math.abs(sx + halfX) < eps) nx -= 1;
    if (Math.abs(sx - halfX) < eps) nx += 1;
    if (Math.abs(sy + halfY) < eps) ny -= 1;
    if (Math.abs(sy - halfY) < eps) ny += 1;
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) {
        ENGINE_F32[P_VEC_B] = sx > 0 ? 1 : -1;
        ENGINE_F32[P_VEC_B + 1] = 0;
        return;
    }
    ENGINE_F32[P_VEC_B] = nx / len;
    ENGINE_F32[P_VEC_B + 1] = ny / len;
}
/**
 * When the circle center sits inside the tile, pick the face it is moving toward.
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} halfX
 * @param {number} halfY
 * @param {number} approachX — segment-local
 * @param {number} approachY
 */
function pushNormalFromInsideApproach(localX, localY, halfX, halfY, approachX, approachY) {
    let bestNx = 0;
    let bestNy = 0;
    let bestDist = 0;
    let bestToward = Infinity;
    let found = false;
    const leftDist = localX + halfX;
    const rightDist = halfX - localX;
    const topDist = localY + halfY;
    const bottomDist = halfY - localY;
    let toward = -approachX;
    if (toward < -1e-6) {
        found = true;
        bestToward = toward;
        bestNx = -1;
        bestNy = 0;
        bestDist = leftDist;
    }
    toward = approachX;
    if (toward < -1e-6 && (!found || toward < bestToward - 1e-6 || (Math.abs(toward - bestToward) <= 1e-6 && rightDist < bestDist))) {
        found = true;
        bestToward = toward;
        bestNx = 1;
        bestNy = 0;
        bestDist = rightDist;
    }
    toward = -approachY;
    if (toward < -1e-6 && (!found || toward < bestToward - 1e-6 || (Math.abs(toward - bestToward) <= 1e-6 && topDist < bestDist))) {
        found = true;
        bestToward = toward;
        bestNx = 0;
        bestNy = -1;
        bestDist = topDist;
    }
    toward = approachY;
    if (toward < -1e-6 && (!found || toward < bestToward - 1e-6 || (Math.abs(toward - bestToward) <= 1e-6 && bottomDist < bestDist))) {
        found = true;
        bestNx = 0;
        bestNy = 1;
        bestDist = bottomDist;
    }
    if (found) {
        ENGINE_F32[P_VEC_C] = bestNx;
        ENGINE_F32[P_VEC_C + 1] = bestNy;
        ENGINE_F32[P_VEC_C + 2] = bestDist;
        return;
    }
    closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    pushNormalAtLocalBoxSurface(ENGINE_F32[P_VEC_A], ENGINE_F32[P_VEC_A + 1], halfX, halfY);
    ENGINE_F32[P_VEC_C] = ENGINE_F32[P_VEC_B];
    ENGINE_F32[P_VEC_C + 1] = ENGINE_F32[P_VEC_B + 1];
    ENGINE_F32[P_VEC_C + 2] = Math.min(leftDist, rightDist, topDist, bottomDist);
}
/**
 * @param {object} circle
 * @param {object} segment
 * @param {{ approachX?: number, approachY?: number }} [options] — world-space motion hint for face selection
 */
export function getLinkCapsuleSegmentPenetration(ax, ay, bx, by, capsuleRadius, segId, { approachX = 0, approachY = 0 } = {}) {
    if (minDistanceSegmentToWall(ax, ay, bx, by, segId) >= capsuleRadius - 1e-5) return false;
    findClosestPointOnPathToWall(ax, ay, bx, by, segId);
    const closestX = ENGINE_F32[P_OUT_DIST_X];
    const closestY = ENGINE_F32[P_OUT_DIST_Y];
    const closestDist = ENGINE_F32[P_OUT_DIST_DIST];
    if (circleSegmentPenetration(closestX, closestY, capsuleRadius, segId, approachX, approachY)) return true;
    if (closestDist >= capsuleRadius) return false;
    closestPointOnSegment(segId, closestX, closestY);
    const wallPointX = ENGINE_F32[P_OUT_DIST_X];
    const wallPointY = ENGINE_F32[P_OUT_DIST_Y];
    let normalX = closestX - wallPointX;
    let normalY = closestY - wallPointY;
    const len = Math.hypot(normalX, normalY);
    if (len < 1e-8) return false;
    normalX /= len;
    normalY /= len;
    ENGINE_F32[P_OUT_PEN_NX] = normalX;
    ENGINE_F32[P_OUT_PEN_NY] = normalY;
    ENGINE_F32[P_OUT_PEN_OVERLAP] = capsuleRadius - closestDist;
    ENGINE_F32[P_OUT_PEN_DIST_SQ] = closestDist * closestDist;
    return true;
}
function circleSegmentPenetration(cx, cy, radius, segId, approachX = 0, approachY = 0) {
    const slab = staticWallSegmentSlab;
    const halfX = slab.width[segId] * 0.5;
    const halfY = slab.height[segId] * 0.5;
    const angle = slab.angle[segId];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const wx = slab.x[segId];
    const wy = slab.y[segId];
    const localX = (cx - wx) * cos - (cy - wy) * sin;
    const localY = (cx - wx) * sin + (cy - wy) * cos;
    worldVectorToSegmentLocal(ENGINE_F32, P_VEC_D, approachX, approachY, angle);
    const localApproachX = ENGINE_F32[P_VEC_D];
    const localApproachY = ENGINE_F32[P_VEC_D + 1];
    const hasApproach = Math.hypot(localApproachX, localApproachY) > 1e-6;
    const strictlyInside = localX > -halfX && localX < halfX && localY > -halfY && localY < halfY;
    closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    const surfaceX = ENGINE_F32[P_VEC_A];
    const surfaceY = ENGINE_F32[P_VEC_A + 1];
    const toCenterX = localX - surfaceX;
    const toCenterY = localY - surfaceY;
    const distanceSq = toCenterX * toCenterX + toCenterY * toCenterY;
    const radiusSq = radius * radius;
    if (distanceSq > radiusSq + 1e-4) return false;
    let localNormX;
    let localNormY;
    let overlap;
    if (strictlyInside && hasApproach) {
        pushNormalFromInsideApproach(localX, localY, halfX, halfY, localApproachX, localApproachY);
        localNormX = ENGINE_F32[P_VEC_C];
        localNormY = ENGINE_F32[P_VEC_C + 1];
        overlap = radius - ENGINE_F32[P_VEC_C + 2];
    } else if (distanceSq <= 1e-10) {
        pushNormalAtLocalBoxSurface(surfaceX, surfaceY, halfX, halfY);
        localNormX = ENGINE_F32[P_VEC_B];
        localNormY = ENGINE_F32[P_VEC_B + 1];
        overlap = radius;
    } else {
        const distance = Math.sqrt(distanceSq);
        overlap = Math.max(0, radius - distance);
        localNormX = toCenterX / distance;
        localNormY = toCenterY / distance;
    }
    const invCos = Math.cos(angle);
    const invSin = Math.sin(angle);
    ENGINE_F32[P_OUT_PEN_NX] = localNormX * invCos - localNormY * invSin;
    ENGINE_F32[P_OUT_PEN_NY] = localNormX * invSin + localNormY * invCos;
    ENGINE_F32[P_OUT_PEN_OVERLAP] = overlap;
    ENGINE_F32[P_OUT_PEN_DIST_SQ] = distanceSq;
    return true;
}
/**
 * @typedef {object} CircleSegmentSweepHit
 * @property {number} t — distance along ray to moving circle center at first touch
 * @property {number} x — center at contact
 * @property {number} y
 * @property {number} nx — wall push-out normal (world space)
 * @property {number} ny
 * @property {object} segment
 */
function worldVectorToSegmentLocal(buf, o, vx, vy, angle) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    rotateXYIntoF32(buf, o, vx, vy, cos, sin);
}
/**
 * Ray vs AABB expanded by circle radius (segment-local space).
 * Returns distance along ray when the circle first touches the unexpanded box.
 *
 * @returns {number | null}
 */
export function rayExpandedLocalAabbHit(ox, oy, dx, dy, half, radius) {
    const minX = -half - radius;
    const maxX = half + radius;
    const minY = -half - radius;
    const maxY = half + radius;
    let sxEnter, sxExit, syEnter, syExit;
    if (Math.abs(dx) < 1e-10) {
        if (ox < minX || ox > maxX) return null;
        sxEnter = -Infinity;
        sxExit = Infinity;
    } else {
        sxEnter = (minX - ox) / dx;
        sxExit = (maxX - ox) / dx;
        if (sxEnter > sxExit) {
            const tmp = sxEnter;
            sxEnter = sxExit;
            sxExit = tmp;
        }
    }
    if (Math.abs(dy) < 1e-10) {
        if (oy < minY || oy > maxY) return null;
        syEnter = -Infinity;
        syExit = Infinity;
    } else {
        syEnter = (minY - oy) / dy;
        syExit = (maxY - oy) / dy;
        if (syEnter > syExit) {
            const tmp = syEnter;
            syEnter = syExit;
            syExit = tmp;
        }
    }
    const tEnter = Math.max(sxEnter, syEnter);
    const tExit = Math.min(sxExit, syExit);
    if (tEnter > tExit || tExit < 0) return null;
    const epsilon = 1e-5;
    if (tEnter >= epsilon) return tEnter;
    if (tExit >= epsilon) return 0;
    return null;
}
/**
 * Analytical swept circle vs one wall tile (rotated square segment).
 *
 * @param {number} ox @param {number} oy — circle center (ray origin)
 * @param {number} dx @param {number} dy — unit direction
 * @param {number} radius
 * @param {object} segment
 * @param {number} [maxDist]
 * @returns {CircleSegmentSweepHit | null}
 */
export function sweepCircleAgainstSegment(ox, oy, dx, dy, radius, segId, maxDist = Infinity) {
    const slab = staticWallSegmentSlab;
    const half = slab.size[segId] / 2;
    toSegmentLocal(segId, ox, oy);
    const localX = ENGINE_F32[P_VEC_B];
    const localY = ENGINE_F32[P_VEC_B + 1];
    worldVectorToSegmentLocal(ENGINE_F32, P_VEC_C, dx, dy, slab.angle[segId]);
    const localDirX = ENGINE_F32[P_VEC_C];
    const localDirY = ENGINE_F32[P_VEC_C + 1];
    const t = rayExpandedLocalAabbHit(localX, localY, localDirX, localDirY, half, radius);
    if (t == null || t > maxDist) return null;
    const wx = ox + dx * t;
    const wy = oy + dy * t;
    let hit = circleSegmentPenetration(wx, wy, radius, segId, dx, dy);
    if (!hit) {
        const nudge = 1e-3;
        hit = circleSegmentPenetration(wx + dx * nudge, wy + dy * nudge, radius, segId, dx, dy);
    }
    if (!hit) return false;
    ENGINE_F32[P_OUT_SWEEP_T] = t;
    ENGINE_F32[P_OUT_SWEEP_X] = wx;
    ENGINE_F32[P_OUT_SWEEP_Y] = wy;
    return true;
}
/** Circle contact geometry — surface points for casts, previews, and impulse hooks. Writes into ENGINE_F32[destOffset..+1]. */
export function circleLeadingPoint(cx, cy, radius, dirX, dirY, destOffset = P_VEC_A) {
    ENGINE_F32[destOffset] = cx + dirX * radius;
    ENGINE_F32[destOffset + 1] = cy + dirY * radius;
}
/** Push-out wall normal (away from solid into free space). */
/** Point on circle A that faces circle B at first center–center contact. */
/** Writes lx, ly, z at buf[o..o+2]. */
export function transformRollVertexInto(buf, o, lx, ly, lz, radius, qw, qx, qy, qz) {
    rotateVecByQuatInto(buf, o, lx, ly, lz - radius, qw, qx, qy, qz);
    buf[o + 2] += radius;
}
export function getRollRadius(body) {
    return Math.max(1, resolveBodyRadius(body));
}
function readBodyRollComponents(body) {
    const physId = body._physId;
    if (physId !== undefined) {
        ENGINE_F32[M_OUT_QW] = entityRollQw[physId];
        ENGINE_F32[M_OUT_QX] = entityRollQx[physId];
        ENGINE_F32[M_OUT_QY] = entityRollQy[physId];
        ENGINE_F32[M_OUT_QZ] = entityRollQz[physId];
        return;
    }
    ENGINE_F32[M_OUT_QW] = body._spawnRollQw ?? 1;
    ENGINE_F32[M_OUT_QX] = body._spawnRollQx ?? 0;
    ENGINE_F32[M_OUT_QY] = body._spawnRollQy ?? 0;
    ENGINE_F32[M_OUT_QZ] = body._spawnRollQz ?? 0;
}
function integrateGroundRoll(body, dtMs) {
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = lengthXY(vx, vy);
    if (speed < 0.01) return;
    const physId = body._physId;
    const r = getRollRadius(body);
    const angle = -(speed / r) * (dtMs / 1000);
    const ax = -vy / speed;
    const ay = vx / speed;
    axisAngleQuatInto(ENGINE_F32, M_OUT_QW, ax, ay, 0, angle);
    const dw = ENGINE_F32[M_OUT_QW];
    const dx = ENGINE_F32[M_OUT_QX];
    const dy = ENGINE_F32[M_OUT_QY];
    const dz = ENGINE_F32[M_OUT_QZ];
    multiplyQuatInto(ENGINE_F32, M_OUT_QW, dw, dx, dy, dz, entityRollQw[physId], entityRollQx[physId], entityRollQy[physId], entityRollQz[physId]);
    entityRollQw[physId] = ENGINE_F32[M_OUT_QW];
    entityRollQx[physId] = ENGINE_F32[M_OUT_QX];
    entityRollQy[physId] = ENGINE_F32[M_OUT_QY];
    entityRollQz[physId] = ENGINE_F32[M_OUT_QZ];
    normalizeEntityRollQuat(physId);
}
export function absorbCollisionRollImpulse(body, dtMs) {
    if (body.strategy?.rolls) return;
    const angW = body.angularVelocity ?? 0;
    if (Math.abs(angW) < 0.02) return;
    const physId = body._physId;
    const angle = -angW * (dtMs / 1000);
    axisAngleQuatInto(ENGINE_F32, M_OUT_QW, 0, 0, 1, angle);
    const dw = ENGINE_F32[M_OUT_QW];
    const dx = ENGINE_F32[M_OUT_QX];
    const dy = ENGINE_F32[M_OUT_QY];
    const dz = ENGINE_F32[M_OUT_QZ];
    multiplyQuatInto(ENGINE_F32, M_OUT_QW, dw, dx, dy, dz, entityRollQw[physId], entityRollQx[physId], entityRollQy[physId], entityRollQz[physId]);
    entityRollQw[physId] = ENGINE_F32[M_OUT_QW];
    entityRollQx[physId] = ENGINE_F32[M_OUT_QX];
    entityRollQy[physId] = ENGINE_F32[M_OUT_QY];
    entityRollQz[physId] = ENGINE_F32[M_OUT_QZ];
    normalizeEntityRollQuat(physId);
}
function quantizeRollQuatF32(qw, qx, qy, qz, steps = 16) {
    const angle = 2 * Math.acos(clamp(qw, -1, 1));
    if (angle < 1e-4) {
        ENGINE_F32[M_OUT_QW] = 1;
        ENGINE_F32[M_OUT_QX] = 0;
        ENGINE_F32[M_OUT_QY] = 0;
        ENGINE_F32[M_OUT_QZ] = 0;
        return;
    }
    const s = Math.sin(angle * 0.5);
    if (Math.abs(s) < 1e-4) {
        ENGINE_F32[M_OUT_QW] = 1;
        ENGINE_F32[M_OUT_QX] = 0;
        ENGINE_F32[M_OUT_QY] = 0;
        ENGINE_F32[M_OUT_QZ] = 0;
        return;
    }
    const ax = qx / s;
    const ay = qy / s;
    const heading = Math.atan2(ay, ax);
    const qAngle = quantizeAngle(angle, steps);
    const qHeading = quantizeAngle(heading, steps);
    axisAngleQuatInto(ENGINE_F32, M_OUT_QW, Math.cos(qHeading), Math.sin(qHeading), 0, qAngle);
}
export function quantizeBodyRollQuatF32(body, steps = 16) {
    readBodyRollComponents(body);
    quantizeRollQuatF32(ENGINE_F32[M_OUT_QW], ENGINE_F32[M_OUT_QX], ENGINE_F32[M_OUT_QY], ENGINE_F32[M_OUT_QZ], steps);
}
export function packRollOrientId(body, steps = 16) {
    quantizeBodyRollQuatF32(body, steps);
    const qw = ENGINE_F32[M_OUT_QW];
    const qx = ENGINE_F32[M_OUT_QX];
    const qy = ENGINE_F32[M_OUT_QY];
    const qz = ENGINE_F32[M_OUT_QZ];
    const angle = 2 * Math.acos(clamp(qw, -1, 1));
    if (angle < 1e-4) return 0x10000;
    const s = Math.sin(angle * 0.5);
    const heading = Math.atan2(qy / s, qx / s);
    const angleBucket = Math.round((angle / (Math.PI * 2)) * steps) % steps;
    const axisBucket = Math.round(((heading + Math.PI) / (Math.PI * 2)) * steps) % steps;
    return 0x10000 | (angleBucket & 0xff) | ((axisBucket & 0xff) << 8);
}
function resolveRollingFriction(strategy, body) {
    const base = strategy.friction ?? 8;
    const threshold = strategy.lowSpeedFrictionThreshold;
    const boosted = strategy.lowSpeedFriction;
    if (threshold == null || boosted == null) return base;
    const speed = lengthXY(body.vx ?? 0, body.vy ?? 0);
    if (speed >= threshold) return base;
    const t = 1 - speed / threshold;
    return base + (boosted - base) * t * t;
}
export function integratePropMotion(body, dtMs) {
    const strategy = body.strategy ?? {};
    const friction = resolveRollingFriction(strategy, body);
    const snapSpeed = strategy.snapSpeed ?? 1;
    absorbCollisionRollImpulse(body, dtMs);
    integrateGroundRoll(body, dtMs);
    body.angularVelocity = 0;
    applyVelocityDamping(body, dtMs, { friction, integrateFacing: false, snapSpeed });
}
// --- MOVED FROM kineticRollActuator.js ---
export function applyGroundRollDrive(prop, dtSec) {
    const drive = prop._groundRollDrive;
    if (!drive) return false;
    if (drive.kind === "brake") return applyRollBrake(prop, dtSec, drive.accel);
    applyRollThrust(prop, dtSec, drive.dirX, drive.dirY, drive.accel, drive.maxSpeed);
    return true;
}
function applyRollBrake(prop, dtSec, accel) {
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed <= 0) return false;
    const decel = accel * dtSec * 2;
    if (speed <= decel) {
        prop.vx = 0;
        prop.vy = 0;
        prop.angularVelocity = 0;
    } else {
        prop.vx -= (prop.vx / speed) * decel;
        prop.vy -= (prop.vy / speed) * decel;
    }
    wakeKineticBody(prop);
    return true;
}
function applyRollThrust(prop, dtSec, dirX, dirY, accel, maxSpeed) {
    const len = Math.hypot(dirX, dirY);
    const dx = len > 0.001 ? dirX / len : 0;
    const dy = len > 0.001 ? dirY / len : 0;
    // Steering force: Desired Velocity - Current Velocity
    const desiredVx = dx * maxSpeed;
    const desiredVy = dy * maxSpeed;
    const steerX = desiredVx - (prop.vx || 0);
    const steerY = desiredVy - (prop.vy || 0);
    const steerLen = Math.hypot(steerX, steerY);
    if (steerLen > 0.001) {
        const ax = (steerX / steerLen) * accel;
        const ay = (steerY / steerLen) * accel;
        applyKineticAcceleration(prop, ax, ay, dtSec);
    }
    const speed = Math.hypot(prop.vx, prop.vy);
    if (speed > maxSpeed) {
        prop.vx = (prop.vx / speed) * maxSpeed;
        prop.vy = (prop.vy / speed) * maxSpeed;
    }
    wakeKineticBody(prop);
}
export function snapMoveTargetToCellCenter(buf, o, grid, worldX, worldY) {
    const idx = grid.worldToIdx(worldX, worldY);
    if (idx === -1) {
        buf[o] = worldX;
        buf[o + 1] = worldY;
        return -1;
    }
    buf[o] = grid.gridCenterXByIdx(idx);
    buf[o + 1] = grid.gridCenterYByIdx(idx);
    return idx;
}
export function getKineticRollConfig(prop, overrides = null) {
    let base = prop._cachedRollBaseConfig;
    if (!base) {
        base = { ...physicsSettings.groundNavRoll, ...prop.strategy?.groundNav };
        prop._cachedRollBaseConfig = base;
    }
    if (overrides && Object.keys(overrides).length > 0) return { ...base, ...overrides };
    return base;
}
export function steerRollToward(prop, dirX, dirY, config, targetSpeed = null, accelOverride = null, maxSpeedOverride = null) {
    if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) return decelerateRoll(prop, config);
    const accel = accelOverride ?? config.accel;
    const maxSpeed = maxSpeedOverride ?? config.maxSpeed;
    const limitSpeed = targetSpeed !== null ? Math.min(maxSpeed, targetSpeed) : maxSpeed;
    let drive = prop._groundRollDrive;
    if (!drive) {
        drive = { kind: "thrust", dirX, dirY, accel, maxSpeed: limitSpeed };
        prop._groundRollDrive = drive;
    } else {
        drive.kind = "thrust";
        drive.dirX = dirX;
        drive.dirY = dirY;
        drive.accel = accel;
        drive.maxSpeed = limitSpeed;
    }
    wakeKineticBody(prop);
}
export function decelerateRoll(prop, config) {
    let drive = prop._groundRollDrive;
    if (!drive) {
        drive = { kind: "brake", accel: config.accel };
        prop._groundRollDrive = drive;
    } else {
        drive.kind = "brake";
        drive.accel = config.accel;
    }
    wakeKineticBody(prop);
}
export function clearGroundRollDrive(prop) {
    delete prop._groundRollDrive;
}
