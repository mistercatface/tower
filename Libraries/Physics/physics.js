import { multiplyQuat, axisAngleQuat, normalizeQuat, rotateVecByQuat, distanceToAabb, rectCorners, rotateXYInto, transformPoint2DInto, distanceSqToLineSegment, rotateXY, normalizeXY, quantizeAngle, clamp, lengthXY, dotXY, addXY, speedSqXY, aabbContains, createAabb, emptyAabbInto, growAabbFromCenterInto, normalizeAngle, cardinalUnitVectorFromAngle, polygonSecondMomentAboutCentroid2D, polygonSignedArea2D, polygonCentroid2D, reversePolygonWinding, findClosestWorldVertexInto, findExtremeVertexInto, findExtremeVertexIndex, findClosestWorldVertexIndex, computeCompoundLocalBounds, convexFootprintHalfExtents, boxLocalFootprint } from "../Math/math.js";
import { MAX_ENTITIES as MAX_PHYS_BODIES, MAX_ENTITIES as MAX_CONTACTS, MAX_ENTITIES as MAX_KINETIC_PAIRS } from "../../Core/engineLimits.js";
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
    if (shape?.type === "Circle") return shape.radius;
    return body._baseRadius ?? body.radius ?? fallback;
}
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
    if (shape.type === "Circle") {
        const r = shape.radius;
        const area = Math.PI * r * r;
        return { area, cx: 0, cy: 0, inertiaPerArea: (r * r) / 2 };
    }
    const verts = shape.vertices;
    const area = Math.abs(polygonSignedArea2D(verts));
    if (area < 1e-10) return { area: 0, cx: 0, cy: 0, inertiaPerArea: 0 };
    const { cx, cy } = polygonCentroid2D(verts);
    return { area, cx, cy, inertiaPerArea: polygonSecondMomentAboutCentroid2D(verts) / area };
}
function compoundInertiaFactor(parts) {
    if (parts.length === 1) return collisionPartMassProperties(parts[0]).inertiaPerArea;
    let totalArea = 0;
    let cx = 0;
    let cy = 0;
    const partAreas = [];
    const partCentroids = [];
    const partInertiaPerArea = [];
    for (let i = 0; i < parts.length; i++) {
        const { area, cx: px, cy: py, inertiaPerArea } = collisionPartMassProperties(parts[i]);
        partAreas.push(area);
        partCentroids.push({ px, py });
        partInertiaPerArea.push(inertiaPerArea);
        totalArea += area;
        cx += px * area;
        cy += py * area;
    }
    cx /= totalArea;
    cy /= totalArea;
    let inertia = 0;
    for (let i = 0; i < parts.length; i++) {
        const Icm = partInertiaPerArea[i] * partAreas[i];
        const dx = partCentroids[i].px - cx;
        const dy = partCentroids[i].py - cy;
        inertia += Icm + partAreas[i] * (dx * dx + dy * dy);
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
            if (part.type === "Polygon") area += polygonShapeArea(part);
            else if (part.type === "Circle") area += Math.PI * part.radius * part.radius;
        }
        return area;
    }
    const shape = body.shape;
    if (shape?.type === "Polygon") return polygonShapeArea(shape);
    if (shape?.type === "Circle") return Math.PI * shape.radius * shape.radius;
    const r = body.radius ?? 0;
    return Math.PI * r * r;
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
    if (shape?.type === "Polygon") {
        const inertiaFactor = polygonShapeInertiaFactor(shape);
        return m * inertiaFactor;
    }
    const r = shape?.type === "Circle" ? shape.radius : (body.radius ?? 0);
    return (m * r * r) / 2;
}
export function massFromBody(body) {
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
    const pinned = strategy.pinned === true;
    body._kineticPinned = pinned ? 1 : 0;
    body._kineticInvMass = pinned ? 0 : 1 / body.mass;
    const moment = body.momentOfInertia;
    body._kineticInvI = moment ? 1 / moment : 0;
    body._kineticRestitution = strategy.pairRestitution ?? -1;
    body._kineticFriction = strategy.pairFriction ?? (strategy.wallPhysics ? strategy.wallPhysics.friction : -1);
    return body;
}
export const BP_KIND_CIRCLE = 0;
export const BP_KIND_OBB = 1;
export const kineticDynamicSlab = { x: new Float32Array(MAX_PHYS_BODIES), y: new Float32Array(MAX_PHYS_BODIES), vx: new Float32Array(MAX_PHYS_BODIES), vy: new Float32Array(MAX_PHYS_BODIES), w: new Float32Array(MAX_PHYS_BODIES), activeSlot: new Int32Array(MAX_PHYS_BODIES), activePhysIds: new Int32Array(MAX_PHYS_BODIES), activePhysCount: 0, islandRoot: new Int32Array(MAX_PHYS_BODIES), bpKind: new Uint8Array(MAX_PHYS_BODIES), r: new Float32Array(MAX_PHYS_BODIES), hx: new Float32Array(MAX_PHYS_BODIES), hy: new Float32Array(MAX_PHYS_BODIES), cos: new Float32Array(MAX_PHYS_BODIES), sin: new Float32Array(MAX_PHYS_BODIES) };
export const kineticStaticSlab = { mass: new Float32Array(MAX_PHYS_BODIES), invMass: new Float32Array(MAX_PHYS_BODIES), invI: new Float32Array(MAX_PHYS_BODIES), pinned: new Uint8Array(MAX_PHYS_BODIES), entityId: new Int32Array(MAX_PHYS_BODIES), restitution: new Float32Array(MAX_PHYS_BODIES), friction: new Float32Array(MAX_PHYS_BODIES) };
kineticDynamicSlab.activeSlot.fill(-1);
kineticDynamicSlab.islandRoot.fill(-1);
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
    const kindA = slab.bpKind[physIdA];
    const kindB = slab.bpKind[physIdB];
    if (kindA === BP_KIND_CIRCLE && kindB === BP_KIND_CIRCLE) return pairCircleCircleOverlapSlab(physIdA, physIdB);
    if (kindA === BP_KIND_CIRCLE && kindB === BP_KIND_OBB) return circleObbOverlapSlab(physIdA, physIdB);
    if (kindA === BP_KIND_OBB && kindB === BP_KIND_CIRCLE) return circleObbOverlapSlab(physIdB, physIdA);
    return obbObbOverlapSlab(physIdA, physIdB);
}
export function stampBroadphaseSlabFromEntity(physId, entity) {
    const slab = kineticDynamicSlab;
    const angle = entityFacing(entity);
    const parts = getEntityCollisionParts(entity);
    if (parts.length > 1) {
        const bounds = computeCompoundLocalBounds(parts, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
        const hx = (bounds.maxX - bounds.minX) * 0.5;
        const hy = (bounds.maxY - bounds.minY) * 0.5;
        const localCx = (bounds.minX + bounds.maxX) * 0.5;
        const localCy = (bounds.minY + bounds.maxY) * 0.5;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        slab.bpKind[physId] = BP_KIND_OBB;
        slab.hx[physId] = hx;
        slab.hy[physId] = hy;
        slab.cos[physId] = cos;
        slab.sin[physId] = sin;
        return;
    }
    const shape = entity.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Circle) {
        slab.bpKind[physId] = BP_KIND_CIRCLE;
        slab.r[physId] = shape.radius;
        return;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Polygon) {
        const span = convexFootprintHalfExtents(shape.vertices);
        slab.bpKind[physId] = BP_KIND_OBB;
        slab.hx[physId] = span.x;
        slab.hy[physId] = span.y;
        slab.cos[physId] = Math.cos(angle);
        slab.sin[physId] = Math.sin(angle);
        return;
    }
    slab.bpKind[physId] = BP_KIND_CIRCLE;
    slab.r[physId] = shape.radius || 0;
}
function writeActiveKineticBodySlabPose(body) {
    copyBodyPoseToSlab(body, body._physId);
}
function copyBodyPoseToSlab(body, physId) {
    const slab = kineticDynamicSlab;
    slab.x[physId] = body.x;
    slab.y[physId] = body.y;
    slab.vx[physId] = body.vx;
    slab.vy[physId] = body.vy;
    slab.w[physId] = body.angularVelocity;
}
function copySlabPoseToBody(physId, body) {
    const slab = kineticDynamicSlab;
    body.x = slab.x[physId];
    body.y = slab.y[physId];
    body.vx = slab.vx[physId];
    body.vy = slab.vy[physId];
    body.angularVelocity = slab.w[physId];
}
export function writeStaticKineticSlabSlot(body) {
    const physId = body._physId;
    const slab = kineticStaticSlab;
    slab.mass[physId] = body.mass;
    slab.invMass[physId] = body._kineticInvMass;
    slab.invI[physId] = body._kineticInvI;
    slab.pinned[physId] = body._kineticPinned;
    slab.entityId[physId] = body.id;
    slab.restitution[physId] = body._kineticRestitution;
    slab.friction[physId] = body._kineticFriction;
}
export function clearActiveKineticBodySlab() {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < slab.activePhysCount; i++) slab.activeSlot[slab.activePhysIds[i]] = -1;
    slab.activePhysCount = 0;
}
export function appendActiveKineticBodySlabPhysId(physId) {
    const slab = kineticDynamicSlab;
    slab.activeSlot[physId] = slab.activePhysCount;
    slab.activePhysIds[slab.activePhysCount++] = physId;
}
export function writebackActiveKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) copySlabPoseToBody(bodies[i]._physId, bodies[i]);
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
export const SHAPE_TYPE_ID = { Circle: 1, Polygon: 2 };
export class Shape {
    constructor() {
        this.type = "Shape";
        this.shapeTypeId = 0;
    }
    getBoundingRadius() {
        return 0;
    }
}
export class CircleShape extends Shape {
    constructor(radius) {
        super();
        this.type = "Circle";
        this.shapeTypeId = SHAPE_TYPE_ID.Circle;
        this.radius = radius;
    }
    getBoundingRadius() {
        return this.radius;
    }
}
export class PolygonShape extends Shape {
    constructor(vertices) {
        super();
        this.type = "Polygon";
        this.shapeTypeId = SHAPE_TYPE_ID.Polygon;
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
        this.vertices = verts;
        this.normals = this._computeNormals();
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
        return normals;
    }
}
const MANIFOLD_MAX_POINTS = 2;
const clipX = new Float32Array(4);
const clipY = new Float32Array(4);
export const SAT_RESULT = new Float32Array(25);
const SAT_BEST_RESULT = new Float32Array(25);
const PROJ_A = new Float32Array(2);
const PROJ_B = new Float32Array(2);
function findEdgeMostAligned(normals, cos, sin, axisX, axisY, wantMax) {
    let bestDot = wantMax ? -Infinity : Infinity;
    let bestIndex = 0;
    const count = normals.length;
    for (let i = 0; i < count; i += 2) {
        const nx = normals[i];
        const ny = normals[i + 1];
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
function satMinOverlapOnAxes(axes, cos, sin, projectPair, overlapState, onNewMin) {
    const axisCount = axes.length;
    for (let i = 0; i < axisCount; i += 2) {
        const nx = axes[i];
        const ny = axes[i + 1];
        const rNx = nx * cos - ny * sin;
        const rNy = nx * sin + ny * cos;
        projectPair(rNx, rNy);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < overlapState.minOverlap) {
            overlapState.minOverlap = overlap;
            overlapState.minNormalX = rNx;
            overlapState.minNormalY = rNy;
            if (onNewMin) onNewMin(i / 2);
        }
    }
    return true;
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
function nearestIncidentVertexIndex(vertices, pxVal, pyVal, cos, sin, px, py) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
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
function buildPolyPolyContactManifold(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB, nx, ny, refPolyIsA, refEdgeIndex) {
    const refShape = refPolyIsA ? shapeA : shapeB;
    const refX = refPolyIsA ? xA : xB;
    const refY = refPolyIsA ? yA : yB;
    const incShape = refPolyIsA ? shapeB : shapeA;
    const incX = refPolyIsA ? xB : xA;
    const incY = refPolyIsA ? yB : yA;
    const refAngle = refPolyIsA ? angleA : angleB;
    const incAngle = refPolyIsA ? angleB : angleA;
    const refCos = Math.cos(refAngle);
    const refSin = Math.sin(refAngle);
    const incCos = Math.cos(incAngle);
    const incSin = Math.sin(incAngle);
    const refFaceNx = refPolyIsA ? nx : -nx;
    const refFaceNy = refPolyIsA ? ny : -ny;
    const refCount = refShape.vertices.length / 2;
    const refEdgeNext = (refEdgeIndex + 1) % refCount;
    const sideEdgeA = (refEdgeIndex + refCount - 1) % refCount;
    const sideEdgeB = refEdgeNext;
    const refVerts = refShape.vertices;
    const edgeAx = refX + refVerts[refEdgeIndex * 2] * refCos - refVerts[refEdgeIndex * 2 + 1] * refSin;
    const edgeAy = refY + refVerts[refEdgeIndex * 2] * refSin + refVerts[refEdgeIndex * 2 + 1] * refCos;
    const edgeBx = refX + refVerts[refEdgeNext * 2] * refCos - refVerts[refEdgeNext * 2 + 1] * refSin;
    const edgeBy = refY + refVerts[refEdgeNext * 2] * refSin + refVerts[refEdgeNext * 2 + 1] * refCos;
    const sideANx = -(refShape.normals[sideEdgeA * 2] * refCos - refShape.normals[sideEdgeA * 2 + 1] * refSin);
    const sideANy = -(refShape.normals[sideEdgeA * 2] * refSin + refShape.normals[sideEdgeA * 2 + 1] * refCos);
    const sideAOffset = sideANx * edgeAx + sideANy * edgeAy;
    const sideBNx = -(refShape.normals[sideEdgeB * 2] * refCos - refShape.normals[sideEdgeB * 2 + 1] * refSin);
    const sideBNy = -(refShape.normals[sideEdgeB * 2] * refSin + refShape.normals[sideEdgeB * 2 + 1] * refCos);
    const sideBOffset = sideBNx * edgeBx + sideBNy * edgeBy;
    const incidentEdge = findEdgeMostAligned(incShape.normals, incCos, incSin, refFaceNx, refFaceNy, true);
    const incCount = incShape.vertices.length / 2;
    const incEdgeNext = (incidentEdge + 1) % incCount;
    const incVerts = incShape.vertices;
    const incX0 = incX + incVerts[incidentEdge * 2] * incCos - incVerts[incidentEdge * 2 + 1] * incSin;
    const incY0 = incY + incVerts[incidentEdge * 2] * incSin + incVerts[incidentEdge * 2 + 1] * incCos;
    const incX1 = incX + incVerts[incEdgeNext * 2] * incCos - incVerts[incEdgeNext * 2 + 1] * incSin;
    const incY1 = incY + incVerts[incEdgeNext * 2] * incSin + incVerts[incEdgeNext * 2 + 1] * incCos;
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
        const incFeature = nearestIncidentVertexIndex(incShape.vertices, incX, incY, incCos, incSin, px, py);
        const refFeature = nearestIncidentVertexIndex(refShape.vertices, refX, refY, refCos, refSin, px, py);
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
const EMPTY_ARRAY = [];
export function getEntityCollisionParts(entity) {
    if (!entity) return EMPTY_ARRAY;
    if (entity.collisionParts?.length) return entity.collisionParts;
    const shape = entity.shape;
    if (shape) {
        if (entity._cachedCollisionPartsShape !== shape) {
            entity._cachedCollisionPartsShape = shape;
            entity._cachedCollisionPartsArray = [shape];
        }
        return entity._cachedCollisionPartsArray;
    }
    return EMPTY_ARRAY;
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
    if (shapeA.shapeTypeId === SHAPE_TYPE_ID.Circle && shapeB.shapeTypeId === SHAPE_TYPE_ID.Circle) return circleCircleContact(xA, yA, shapeA, xB, yB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_ID.Polygon && shapeB.shapeTypeId === SHAPE_TYPE_ID.Polygon) return satPolygonPolygon(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_ID.Circle && shapeB.shapeTypeId === SHAPE_TYPE_ID.Polygon) return satCirclePolygon(xA, yA, shapeA, xB, yB, cosB, sinB, shapeB);
    if (shapeA.shapeTypeId === SHAPE_TYPE_ID.Polygon && shapeB.shapeTypeId === SHAPE_TYPE_ID.Circle) {
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
    return bestEntityPairContactAtPose(getEntityCollisionParts(bodyA), getEntityCollisionParts(bodyB), xA, yA, Math.cos(facingA), Math.sin(facingA), xB, yB, Math.cos(facingB), Math.sin(facingB));
}
export function checkEntityPairCollisionAtSlabPose(bodyA, bodyB, physIdA, physIdB, xA, yA, xB, yB) {
    const slab = kineticDynamicSlab;
    return bestEntityPairContactAtPose(getEntityCollisionParts(bodyA), getEntityCollisionParts(bodyB), xA, yA, slab.cos[physIdA], slab.sin[physIdA], xB, yB, slab.cos[physIdB], slab.sin[physIdB]);
}
export function satCheckCollision(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
    return satCheckShapesAtPose(xA, yA, Math.cos(angleA), Math.sin(angleA), shapeA, xB, yB, Math.cos(angleB), Math.sin(angleB), shapeB);
}
function satPolygonPolygon(xA, yA, cosA, sinA, shapeA, xB, yB, cosB, sinB, shapeB) {
    const overlapState = { minOverlap: Infinity, minNormalX: 0, minNormalY: 0 };
    let refPolyIsA = true;
    let refEdgeIndex = 0;
    const projectPolyPair = (rNx, rNy) => {
        satProjectPolygon(PROJ_A, rNx, rNy, shapeA, xA, yA, cosA, sinA);
        satProjectPolygon(PROJ_B, rNx, rNy, shapeB, xB, yB, cosB, sinB);
    };
    if (
        !satMinOverlapOnAxes(shapeA.normals, cosA, sinA, projectPolyPair, overlapState, (edgeIndex) => {
            refPolyIsA = true;
            refEdgeIndex = edgeIndex;
        })
    )
        return false;
    if (
        !satMinOverlapOnAxes(shapeB.normals, cosB, sinB, projectPolyPair, overlapState, (edgeIndex) => {
            refPolyIsA = false;
            refEdgeIndex = edgeIndex;
        })
    )
        return false;
    const minOverlap = overlapState.minOverlap;
    let minNormalX = overlapState.minNormalX;
    let minNormalY = overlapState.minNormalY;
    const dx = xB - xA;
    const dy = yB - yA;
    if (dx * minNormalX + dy * minNormalY < 0) {
        minNormalX = -minNormalX;
        minNormalY = -minNormalY;
    }
    const angleA = Math.atan2(sinA, cosA);
    const angleB = Math.atan2(sinB, cosB);
    const pointCount = buildPolyPolyContactManifold(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB, minNormalX, minNormalY, refPolyIsA, refEdgeIndex);
    if (pointCount == null) {
        const featureB = findExtremeVertexIndex(shapeB.vertices, xB, yB, cosB, sinB, minNormalX, minNormalY, false);
        const featureA = findExtremeVertexIndex(shapeA.vertices, xA, yA, cosA, sinA, minNormalX, minNormalY, true);
        const vertsA = shapeA.vertices;
        const vertsB = shapeB.vertices;
        const ai = featureA * 2;
        const bi = featureB * 2;
        const contactAx = xA + vertsA[ai] * cosA - vertsA[ai + 1] * sinA;
        const contactAy = yA + vertsA[ai] * sinA + vertsA[ai + 1] * cosA;
        const contactBx = xB + vertsB[bi] * cosB - vertsB[bi + 1] * sinB;
        const contactBy = yB + vertsB[bi] * sinB + vertsB[bi + 1] * cosB;
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
function satCirclePolygon(cxCircle, cyCircle, circleShape, pxPoly, pyPoly, cosP, sinP, polyShape) {
    if (isNaN(cxCircle) || isNaN(cyCircle) || isNaN(pxPoly) || isNaN(pyPoly)) return false;
    const overlapState = { minOverlap: Infinity, minNormalX: 0, minNormalY: 0 };
    const projectCirclePolyPair = (rNx, rNy) => {
        satProjectCircle(PROJ_A, rNx, rNy, cxCircle, cyCircle, circleShape);
        satProjectPolygon(PROJ_B, rNx, rNy, polyShape, pxPoly, pyPoly, cosP, sinP);
    };
    if (!satMinOverlapOnAxes(polyShape.normals, cosP, sinP, projectCirclePolyPair, overlapState)) return false;
    const featureB = findClosestWorldVertexIndex(polyShape.vertices, pxPoly, pyPoly, cosP, sinP, cxCircle, cyCircle);
    const vi = featureB * 2;
    const closestVx = pxPoly + polyShape.vertices[vi] * cosP - polyShape.vertices[vi + 1] * sinP;
    const closestVy = pyPoly + polyShape.vertices[vi] * sinP + polyShape.vertices[vi + 1] * cosP;
    const dx = closestVx - cxCircle;
    const dy = closestVy - cyCircle;
    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const nX = dx / len;
        const nY = dy / len;
        satProjectCircle(PROJ_A, nX, nY, cxCircle, cyCircle, circleShape);
        satProjectPolygon(PROJ_B, nX, nY, polyShape, pxPoly, pyPoly, cosP, sinP);
        if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
        const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
        if (overlap < overlapState.minOverlap) {
            overlapState.minOverlap = overlap;
            overlapState.minNormalX = nX;
            overlapState.minNormalY = nY;
        }
    }
    let minNormalX = overlapState.minNormalX;
    let minNormalY = overlapState.minNormalY;
    const cx = pxPoly - cxCircle;
    const cy = pyPoly - cyCircle;
    if (cx * minNormalX + cy * minNormalY < 0) {
        minNormalX = -minNormalX;
        minNormalY = -minNormalY;
    }
    const minOverlap = overlapState.minOverlap;
    const contactX = cxCircle + minNormalX * (circleShape.radius - minOverlap / 2);
    const contactY = cyCircle + minNormalY * (circleShape.radius - minOverlap / 2);
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
function satProjectPolygon(out, axisX, axisY, shape, px, py, cos, sin) {
    let min = Infinity;
    let max = -Infinity;
    const count = shape.vertices.length;
    for (let i = 0; i < count; i += 2) {
        const vx_local = shape.vertices[i];
        const vy_local = shape.vertices[i + 1];
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
function satProjectCircle(out, axisX, axisY, cx, cy, shape) {
    const projection = cx * axisX + cy * axisY;
    out[0] = projection - shape.radius;
    out[1] = projection + shape.radius;
}
/**
 * Position correction along contact normals (no velocity change).
 */
/**
 * @param {{ x: number, y: number, _physId?: number }} body — mutated in place
 */
export function applyPositionCorrection(body, normalX, normalY, overlap) {
    if (body.strategy?.pinned) return;
    addXY(body, normalX * overlap, normalY * overlap);
}
export function applySlabPositionCorrection(physId, normalX, normalY, overlap) {
    kineticDynamicSlab.x[physId] += normalX * overlap;
    kineticDynamicSlab.y[physId] += normalY * overlap;
}
/**
 * Mass-weighted separation of two overlapping bodies.
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB, pinnedA = false, pinnedB = false) {
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        addXY(b, normalX * overlap, normalY * overlap);
        return;
    }
    if (pinnedB) {
        addXY(a, -normalX * overlap, -normalY * overlap);
        return;
    }
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
/**
 * @param {{ x: number, y: number }} entity
 * @returns {{ cx: number, cy: number }}
 */
export function computeCircleWallContact(entity, normalX, normalY, radius) {
    return { cx: entity.x - normalX * radius, cy: entity.y - normalY * radius };
}
/**
 * @param {{ x: number, y: number }} entity
 * @param {number} normalX
 * @param {number} normalY
 * @param {number} overlap
 * @param {number} cx
 * @param {number} cy
 * @returns {{ cx: number, cy: number }}
 */
export function computePolygonWallContact(entity, normalX, normalY, overlap, cx = NaN, cy = NaN) {
    return { cx: !isNaN(cx) ? cx : entity.x - normalX * overlap, cy: !isNaN(cy) ? cy : entity.y - normalY * overlap };
}
export const BROADPHASE_KIND = { Circle: 1, Obb: 2 };
const entityWorldAabbOut = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
function obbWorldAabbInto(out, cx, cy, hx, hy, cos, sin) {
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
}
function entityWorldAabbFromShapeInto(out, entity) {
    const x = entity.x;
    const y = entity.y;
    const angle = entityFacing(entity);
    const parts = getEntityCollisionParts(entity);
    if (parts.length > 1) {
        const bounds = computeCompoundLocalBounds(parts, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
        const hx = (bounds.maxX - bounds.minX) * 0.5;
        const hy = (bounds.maxY - bounds.minY) * 0.5;
        const localCx = (bounds.minX + bounds.maxX) * 0.5;
        const localCy = (bounds.minY + bounds.maxY) * 0.5;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cx = x + localCx * cos - localCy * sin;
        const cy = y + localCx * sin + localCy * cos;
        obbWorldAabbInto(out, cx, cy, hx, hy, cos, sin);
        return;
    }
    const shape = entity.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Circle) {
        const r = shape.radius;
        out.minX = x - r;
        out.minY = y - r;
        out.maxX = x + r;
        out.maxY = y + r;
        return;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Polygon) {
        const span = convexFootprintHalfExtents(shape.vertices);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        obbWorldAabbInto(out, x, y, span.x, span.y, cos, sin);
        return;
    }
    const r = shape.radius || 0;
    out.minX = x - r;
    out.minY = y - r;
    out.maxX = x + r;
    out.maxY = y + r;
}
function entityWorldAabbInto(out, entity) {
    const physId = entity._physId;
    const slab = kineticDynamicSlab;
    if (physId !== undefined && physId >= 0) {
        if (slab.bpKind[physId] === BP_KIND_CIRCLE) {
            const cx = slab.x[physId];
            const cy = slab.y[physId];
            const r = slab.r[physId];
            out.minX = cx - r;
            out.minY = cy - r;
            out.maxX = cx + r;
            out.maxY = cy + r;
            return;
        }
        if (slab.bpKind[physId] === BP_KIND_OBB) {
            obbWorldAabbInto(out, slab.x[physId], slab.y[physId], slab.hx[physId], slab.hy[physId], slab.cos[physId], slab.sin[physId]);
            return;
        }
    }
    entityWorldAabbFromShapeInto(out, entity);
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
    const parts = getEntityCollisionParts(entity);
    if (parts.length <= 1) return parts[0].getBoundingRadius();
    const bounds = computeCompoundLocalBounds(parts, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
    return lengthXY((bounds.maxX - bounds.minX) * 0.5, (bounds.maxY - bounds.minY) * 0.5);
}
export function markBroadphaseDirty(entity) {
    entity._broadphaseDirty = true;
}
export function entityContainedInAabb(entity, outer) {
    entityWorldAabbInto(entityWorldAabbOut, entity);
    return outer.minX <= entityWorldAabbOut.minX && outer.minY <= entityWorldAabbOut.minY && outer.maxX >= entityWorldAabbOut.maxX && outer.maxY >= entityWorldAabbOut.maxY;
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
export function snapshotKineticBodySlab(bodies) {
    for (let i = 0; i < bodies.length; i++) {
        const entity = bodies[i];
        normalizeKineticBody(entity);
        writeStaticKineticSlabSlot(entity);
        writeActiveKineticBodySlabPose(entity);
        stampBroadphaseSlabFromEntity(entity._physId, entity);
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
export function shouldResolveKineticPair(a, b, overlaps) {
    return overlaps && (isKinematicallyActive(a) || isKinematicallyActive(b));
}
function shouldResolveKineticPairSlab(physIdA, physIdB, overlaps) {
    return overlaps && (isKinematicallyActiveSlab(physIdA) || isKinematicallyActiveSlab(physIdB));
}
export function allowsKineticCollisionPair(primary, other, overlaps) {
    if (primary === other) return false;
    if (!other.strategy?.isKinetic) return false;
    const otherActive = other._activeSlot != null && other._activeSlot >= 0;
    if (otherActive && primary.id >= other.id) return false;
    const physIdA = primary._physId;
    const physIdB = other._physId;
    if (physIdA !== undefined && physIdA !== -1 && physIdB !== undefined && physIdB !== -1) return shouldResolveKineticPairSlab(physIdA, physIdB, overlaps);
    return shouldResolveKineticPair(primary, other, overlaps);
}
function kineticOverlapsWallCandidates(px, py, body, candidates) {
    if (!candidates.length) return false;
    const parts = getEntityCollisionParts(body);
    const bodyFacing = entityFacing(body);
    const bodyCos = Math.cos(bodyFacing);
    const bodySin = Math.sin(bodyFacing);
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < candidates.length; i++) if (distanceSqToSegment(candidates[i], px, py) <= radiusSq) return true;
            continue;
        }
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            const segFacing = entityFacing(seg);
            const segShape = ensureWallSegmentPolygonShape(seg);
            if (satCheckShapesAtPose(px, py, bodyCos, bodySin, shape, seg.x, seg.y, Math.cos(segFacing), Math.sin(segFacing), segShape)) return true;
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
function createBodyImpulseMotion(body) {
    return {
        get x() {
            return body.x;
        },
        get y() {
            return body.y;
        },
        get vx() {
            return body.vx;
        },
        get vy() {
            return body.vy;
        },
        get w() {
            return body.angularVelocity;
        },
        get invMass() {
            return body._kineticInvMass;
        },
        get invI() {
            return body._kineticInvI;
        },
        get hasMoment() {
            return body._kineticInvI !== 0;
        },
        velocityDefined() {
            return body.vx !== undefined && body.vy !== undefined;
        },
        spinForImpulse(w) {
            return w || 0;
        },
        setVelocities(vx, vy, w) {
            body.vx = vx;
            body.vy = vy;
            if (body.momentOfInertia) body.angularVelocity = w;
        },
    };
}
function createSlabImpulseMotion(physId) {
    return {
        get x() {
            return kineticDynamicSlab.x[physId];
        },
        get y() {
            return kineticDynamicSlab.y[physId];
        },
        get vx() {
            return kineticDynamicSlab.vx[physId];
        },
        get vy() {
            return kineticDynamicSlab.vy[physId];
        },
        get w() {
            return kineticDynamicSlab.w[physId];
        },
        get invMass() {
            return kineticStaticSlab.invMass[physId];
        },
        get invI() {
            return kineticStaticSlab.invI[physId];
        },
        get hasMoment() {
            return kineticStaticSlab.invI[physId] > 0;
        },
        velocityDefined() {
            return true;
        },
        spinForImpulse(w) {
            return w;
        },
        setVelocities(vx, vy, w) {
            kineticDynamicSlab.vx[physId] = vx;
            kineticDynamicSlab.vy[physId] = vy;
            kineticDynamicSlab.w[physId] = w;
        },
    };
}
function applyStaticSurfaceImpulseCore(motion, normalX, normalY, cx, cy, { restitution = 0, friction = 0.9 } = {}) {
    const bx = motion.x;
    const by = motion.y;
    const bvx = motion.vx;
    const bvy = motion.vy;
    const bw = motion.w;
    if (!motion.velocityDefined()) return 0;
    const rx = cx - bx;
    const ry = cy - by;
    const w = motion.spinForImpulse(bw);
    const vpx = bvx - w * ry;
    const vpy = bvy + w * rx;
    const approachDot = dotXY(vpx, vpy, normalX, normalY);
    if (approachDot >= 0) return approachDot;
    const invMassVal = motion.invMass;
    const invI = motion.invI;
    const hasMoment = motion.hasMoment;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    let newVx = bvx + j * normalX * invMassVal;
    let newVy = bvy + j * normalY * invMassVal;
    let newW = bw;
    if (hasMoment) newW = motion.spinForImpulse(bw) + j * cross * invI;
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
    motion.setVelocities(newVx, newVy, newW);
    return approachDot;
}
function applyBodyStaticSurfaceImpulse(body, normalX, normalY, cx, cy, opts = {}) {
    return applyStaticSurfaceImpulseCore(createBodyImpulseMotion(body), normalX, normalY, cx, cy, opts);
}
function applySlabStaticSurfaceImpulse(physId, normalX, normalY, cx, cy, opts = {}) {
    return applyStaticSurfaceImpulseCore(createSlabImpulseMotion(physId), normalX, normalY, cx, cy, opts);
}
export function ensureWallSegmentPolygonShape(segment) {
    if (!segment.shape) {
        const halfX = segment.width !== undefined ? segment.width / 2 : segment.size / 2;
        const halfY = segment.height !== undefined ? segment.height / 2 : segment.size / 2;
        segment.shape = new PolygonShape(boxLocalFootprint(halfX, halfY));
    }
    return segment.shape;
}
const EMPTY_WALL_HITS = [];
function createBodyWallMotion(body) {
    const impulse = createBodyImpulseMotion(body);
    return {
        get bx() {
            return body.x;
        },
        get by() {
            return body.y;
        },
        get approachVx() {
            return body.vx ?? 0;
        },
        get approachVy() {
            return body.vy ?? 0;
        },
        get vx() {
            return body.vx ?? 0;
        },
        get vy() {
            return body.vy ?? 0;
        },
        get w() {
            return body.angularVelocity ?? 0;
        },
        applyPositionCorrection(normalX, normalY, overlap) {
            applyPositionCorrection(body, normalX, normalY, overlap);
        },
        applyStaticSurfaceImpulse(normalX, normalY, cx, cy, opts) {
            return applyStaticSurfaceImpulseCore(impulse, normalX, normalY, cx, cy, opts);
        },
    };
}
function createSlabWallMotion(physId) {
    const impulse = createSlabImpulseMotion(physId);
    return {
        get bx() {
            return kineticDynamicSlab.x[physId];
        },
        get by() {
            return kineticDynamicSlab.y[physId];
        },
        get approachVx() {
            return kineticDynamicSlab.vx[physId];
        },
        get approachVy() {
            return kineticDynamicSlab.vy[physId];
        },
        get vx() {
            return kineticDynamicSlab.vx[physId];
        },
        get vy() {
            return kineticDynamicSlab.vy[physId];
        },
        get w() {
            return kineticDynamicSlab.w[physId];
        },
        applyPositionCorrection(normalX, normalY, overlap) {
            if (!kineticStaticSlab.pinned[physId]) applySlabPositionCorrection(physId, normalX, normalY, overlap);
        },
        applyStaticSurfaceImpulse(normalX, normalY, cx, cy, opts) {
            return applyStaticSurfaceImpulseCore(impulse, normalX, normalY, cx, cy, opts);
        },
    };
}
function resolveAgainstWallSegmentsCore(body, shape, segments, motion, { restitution = 0, friction = 0.9, passes = 2, shouldBreakWallHit = null } = {}) {
    let collided = false;
    const wantHits = shouldBreakWallHit != null;
    const hits = wantHits ? [] : EMPTY_WALL_HITS;
    const radius = shape.getBoundingRadius();
    let bestNormalX = 0;
    let bestNormalY = 0;
    let bestOverlap = 0;
    let bestCx = NaN;
    let bestCy = NaN;
    let bestSegment = null;
    for (let pass = 0; pass < passes; pass++) {
        let hasBest = false;
        for (const seg of segments) {
            const maxDist = radius + seg.size * 0.75;
            const bx = motion.bx;
            const by = motion.by;
            if (Math.abs(bx - seg.x) > maxDist || Math.abs(by - seg.y) > maxDist) continue;
            let normalX, normalY, overlap;
            let satCollisionFound = false;
            if (shape.type === "Circle") {
                if (!circleSegmentPenetration(bx, by, shape.radius, seg, motion.approachVx, motion.approachVy)) continue;
                normalX = SEGMENT_PEN[0];
                normalY = SEGMENT_PEN[1];
                overlap = SEGMENT_PEN[2];
            } else if (shape.type === "Polygon") {
                const segShape = ensureWallSegmentPolygonShape(seg);
                if (!satCheckCollision(bx, by, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) continue;
                normalX = -SAT_RESULT[1];
                normalY = -SAT_RESULT[2];
                overlap = SAT_RESULT[0];
                satCollisionFound = true;
            } else continue;
            if (!hasBest || overlap > bestOverlap) {
                bestNormalX = normalX;
                bestNormalY = normalY;
                bestOverlap = overlap;
                bestCx = satCollisionFound ? SAT_RESULT[3] : NaN;
                bestCy = satCollisionFound ? SAT_RESULT[4] : NaN;
                bestSegment = seg;
                hasBest = true;
            }
        }
        if (!hasBest) break;
        collided = true;
        const bx = motion.bx;
        const by = motion.by;
        const contact = shape.type === "Circle" ? computeCircleWallContact({ x: bx, y: by }, bestNormalX, bestNormalY, shape.radius) : computePolygonWallContact({ x: bx, y: by }, bestNormalX, bestNormalY, bestOverlap, bestCx, bestCy);
        const bvx = motion.vx;
        const bvy = motion.vy;
        const bw = motion.w;
        const approachDot = dotXY(bvx - bw * (contact.cy - by), bvy + bw * (contact.cx - bx), bestNormalX, bestNormalY);
        const hit = wantHits ? { approachDot, normalX: bestNormalX, normalY: bestNormalY, segment: bestSegment, overlap: bestOverlap, contactX: contact.cx, contactY: contact.cy } : null;
        if (hit && shouldBreakWallHit(hit)) {
            hits.push(hit);
            motion.applyStaticSurfaceImpulse(bestNormalX, bestNormalY, contact.cx, contact.cy, { restitution, friction });
            break;
        }
        motion.applyPositionCorrection(bestNormalX, bestNormalY, bestOverlap);
        motion.applyStaticSurfaceImpulse(bestNormalX, bestNormalY, contact.cx, contact.cy, { restitution, friction });
        if (hit) hits.push(hit);
    }
    return { collided, hits };
}
export function resolveBodyAgainstWallSegments(body, shape, segments, opts = {}) {
    return resolveAgainstWallSegmentsCore(body, shape, segments, createBodyWallMotion(body), opts);
}
function resolveSlabAgainstWallSegments(physId, body, shape, segments, opts = {}) {
    return resolveAgainstWallSegmentsCore(body, shape, segments, createSlabWallMotion(physId), opts);
}
/** Clear wall-resolve frame cache so entity-pair contacts can re-resolve against walls. */
export function invalidateWallResolveCache(...entities) {
    for (let i = 0; i < entities.length; i++) entities[i]._wallResolvedFrame = null;
}
export class WallCollisionResolver {
    /**
     * @param {object} entity
     * @param {{ frameId: number, getWallCandidates: (entity: object) => object[] }} spatialFrame
     * @returns {boolean}
     */
    resolve(entity, spatialFrame, shouldBreakWallHit = null) {
        if (entity._wallResolvedFrame === spatialFrame.frameId) return { collided: entity._wallResolvedCollided, hits: EMPTY_WALL_HITS };
        entity._wallResolvedFrame = spatialFrame.frameId;
        const candidateWalls = spatialFrame.getWallCandidates(entity);
        const hits = [];
        if (candidateWalls.length === 0) {
            entity._wallResolvedCollided = false;
            return { collided: false, hits };
        }
        const wp = entity.strategy?.wallPhysics;
        const parts = getEntityCollisionParts(entity);
        let collided = hits.length > 0;
        const physId = entity._physId;
        const hasSlab = physId !== undefined && physId !== -1;
        for (let i = 0; i < parts.length; i++) {
            const result = hasSlab ? resolveSlabAgainstWallSegments(physId, entity, parts[i], candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9, shouldBreakWallHit }) : resolveBodyAgainstWallSegments(entity, parts[i], candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9, shouldBreakWallHit });
            if (result.collided) collided = true;
            if (result.hits.length) hits.push(...result.hits);
        }
        if (collided) wakeKineticBody(entity);
        entity._wallResolvedCollided = collided;
        return { collided, hits };
    }
}
const LINK_CAPSULE_WALL_PASSES = 4;
/** Reused per-island wall candidate list — cleared at the start of each awake island. */
const islandLinkWallCandidates = [];
/** Segment identity set paired with islandLinkWallCandidates for O(1) dedup during gather. */
const islandLinkWallSegmentSet = new Set();
/** Per-link AABB filter into the current island list before narrow-phase wall tests. */
const linkFilteredWallCandidates = [];
const MAX_KINETIC_CONSTRAINTS = 2048;
const MAX_ISLAND_GROUPS = 256;
const CONSTRAINT_EDGE_KEY_SCALE = 1_000_000;
export const kineticConstraintSlab = {
    count: 0,
    activeCount: 0,
    groupCount: 0,
    groupCounts: new Int32Array(MAX_ISLAND_GROUPS),
    type: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyA: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyB: new Array(MAX_KINETIC_CONSTRAINTS),
    physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    dynamic: { accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS), nx: new Float32Array(MAX_KINETIC_CONSTRAINTS), ny: new Float32Array(MAX_KINETIC_CONSTRAINTS), rAn: new Float32Array(MAX_KINETIC_CONSTRAINTS), rBn: new Float32Array(MAX_KINETIC_CONSTRAINTS), k: new Float32Array(MAX_KINETIC_CONSTRAINTS), error: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
    static: { anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS), anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS), restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS), referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS), massA: new Float32Array(MAX_KINETIC_CONSTRAINTS), massB: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invMassB: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIA: new Float32Array(MAX_KINETIC_CONSTRAINTS), invIB: new Float32Array(MAX_KINETIC_CONSTRAINTS), pinnedA: new Uint8Array(MAX_KINETIC_CONSTRAINTS), pinnedB: new Uint8Array(MAX_KINETIC_CONSTRAINTS), capsuleRadius: new Float32Array(MAX_KINETIC_CONSTRAINTS) },
    entry: new Array(MAX_KINETIC_CONSTRAINTS),
    reset() {
        this.count = 0;
        this.activeCount = 0;
        this.groupCount = 0;
    },
};
const constraintPhysSyncSeen = new Set();
const constraintBridgePhysIds = [];
const orderBodyByPhysId = new Array(MAX_PHYS_BODIES);
const orderSeenPhysIds = new Uint8Array(MAX_PHYS_BODIES);
const orderUniquePhysIds = [];
const orderUsedItems = new Uint8Array(MAX_KINETIC_CONSTRAINTS);
const orderOrdered = [];
const bucketRoots = new Int32Array(MAX_ISLAND_GROUPS);
const gatherBuckets = new Array(MAX_ISLAND_GROUPS);
const awakeGroups = [];
const asleepGroups = [];
const bucketPool = [];
let bucketPoolUseCount = 0;
function getPoolArray() {
    if (bucketPoolUseCount >= bucketPool.length) bucketPool.push([]);
    const arr = bucketPool[bucketPoolUseCount++];
    arr.length = 0;
    return arr;
}
const itemPool = [];
let itemPoolUseCount = 0;
function getPoolItem() {
    if (itemPoolUseCount >= itemPool.length) itemPool.push({ entry: null, bodyA: null, bodyB: null });
    return itemPool[itemPoolUseCount++];
}
const anchorAWorld = { x: 0, y: 0 };
const anchorBWorld = { x: 0, y: 0 };
function orderIslandConstraintItems(items) {
    if (items.length <= 1) return items;
    orderUniquePhysIds.length = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const physA = item.bodyA._physId;
        const physB = item.bodyB._physId;
        if (physA !== undefined && physA !== -1 && orderSeenPhysIds[physA] === 0) {
            orderSeenPhysIds[physA] = 1;
            orderUniquePhysIds.push(physA);
            orderBodyByPhysId[physA] = item.bodyA;
        }
        if (physB !== undefined && physB !== -1 && orderSeenPhysIds[physB] === 0) {
            orderSeenPhysIds[physB] = 1;
            orderUniquePhysIds.push(physB);
            orderBodyByPhysId[physB] = item.bodyB;
        }
    }
    let startId = null;
    let startPhysId = null;
    for (let i = 0; i < orderUniquePhysIds.length; i++) {
        const physId = orderUniquePhysIds[i];
        const body = orderBodyByPhysId[physId];
        const neighbors = body._kineticLinkNeighbors;
        let inIslandCount = 0;
        if (neighbors)
            for (let j = 0; j < neighbors.length; j++) {
                const neighborPhys = neighbors[j]._physId;
                if (neighborPhys !== undefined && neighborPhys !== -1 && orderSeenPhysIds[neighborPhys] === 1) inIslandCount++;
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
            const body = orderBodyByPhysId[physId];
            if (body.id < minId) {
                minId = body.id;
                startPhysId = physId;
                startId = body.id;
            }
        }
    }
    orderOrdered.length = 0;
    orderUsedItems.fill(0, 0, items.length);
    let currentPhysId = startPhysId;
    while (orderOrdered.length < items.length) {
        const body = orderBodyByPhysId[currentPhysId];
        const neighbors = body._kineticLinkNeighbors ?? [];
        let advanced = false;
        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i];
            const neighborPhys = neighbor._physId;
            if (neighborPhys === undefined || neighborPhys === -1 || orderSeenPhysIds[neighborPhys] === 0) continue;
            let itemIdx = -1;
            for (let k = 0; k < items.length; k++) {
                if (orderUsedItems[k] === 1) continue;
                const item = items[k];
                const physA = item.bodyA._physId;
                const physB = item.bodyB._physId;
                if ((physA === currentPhysId && physB === neighborPhys) || (physA === neighborPhys && physB === currentPhysId)) {
                    itemIdx = k;
                    break;
                }
            }
            if (itemIdx === -1) continue;
            orderOrdered.push(items[itemIdx]);
            orderUsedItems[itemIdx] = 1;
            currentPhysId = neighborPhys;
            advanced = true;
            break;
        }
        if (!advanced) break;
    }
    for (let i = 0; i < items.length; i++) if (orderUsedItems[i] === 0) orderOrdered.push(items[i]);
    for (let i = 0; i < orderUniquePhysIds.length; i++) {
        const physId = orderUniquePhysIds[i];
        orderBodyByPhysId[physId] = undefined;
        orderSeenPhysIds[physId] = 0;
    }
    return orderOrdered;
}
function circleRadiusFromBody(body) {
    const parts = getEntityCollisionParts(body);
    for (let i = 0; i < parts.length; i++) if (parts[i].type === "Circle") return parts[i].radius;
    return body.radius;
}
function linkCapsuleRadius(bodyA, bodyB) {
    return Math.max(circleRadiusFromBody(bodyA), circleRadiusFromBody(bodyB)) + 0.05;
}
function appendConstraintEntry(slab, item) {
    const idx = slab.count++;
    const bodyA = item.bodyA;
    const bodyB = item.bodyB;
    slab.type[idx] = item.entry.type ?? "distance";
    slab.bodyA[idx] = bodyA;
    slab.bodyB[idx] = bodyB;
    slab.physIdA[idx] = bodyA._physId ?? -1;
    slab.physIdB[idx] = bodyB._physId ?? -1;
    if (slab.type[idx] === "angle") {
        slab.static.referenceAngle[idx] = item.entry.referenceAngle ?? 0;
        slab.static.anchorAx[idx] = 0;
        slab.static.anchorAy[idx] = 0;
        slab.static.anchorBx[idx] = 0;
        slab.static.anchorBy[idx] = 0;
        slab.static.restLength[idx] = 0;
        slab.static.capsuleRadius[idx] = 0;
    } else {
        slab.static.referenceAngle[idx] = 0;
        slab.static.anchorAx[idx] = item.entry.anchorA?.x ?? 0;
        slab.static.anchorAy[idx] = item.entry.anchorA?.y ?? 0;
        slab.static.anchorBx[idx] = item.entry.anchorB?.x ?? 0;
        slab.static.anchorBy[idx] = item.entry.anchorB?.y ?? 0;
        slab.static.restLength[idx] = item.entry.restLength ?? 0;
        slab.static.capsuleRadius[idx] = linkCapsuleRadius(bodyA, bodyB);
    }
    normalizeKineticBody(bodyA);
    normalizeKineticBody(bodyB);
    slab.static.massA[idx] = bodyA.mass;
    slab.static.massB[idx] = bodyB.mass;
    slab.static.invMassA[idx] = bodyA._kineticInvMass;
    slab.static.invMassB[idx] = bodyB._kineticInvMass;
    slab.static.invIA[idx] = bodyA._kineticInvI;
    slab.static.invIB[idx] = bodyB._kineticInvI;
    slab.static.pinnedA[idx] = bodyA._kineticPinned;
    slab.static.pinnedB[idx] = bodyB._kineticPinned;
    slab.dynamic.accumulatedImpulse[idx] = item.entry.accumulatedImpulse || 0;
    slab.entry[idx] = item.entry;
}
function islandItemsAsleep(items) {
    for (let i = 0; i < items.length; i++) {
        const { bodyA, bodyB } = items[i];
        if (!bodyA.isSleeping || !bodyB.isSleeping) return false;
    }
    return items.length > 0;
}
function appendIslandConstraintGroup(slab, ordered) {
    const groupStart = slab.count;
    for (let i = 0; i < ordered.length; i++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS) break;
        appendConstraintEntry(slab, ordered[i]);
    }
    const count = slab.count - groupStart;
    if (count === 0) return;
    slab.groupCounts[slab.groupCount] = count;
    slab.groupCount++;
}
function syncConstraintSlabBodies(slab) {
    constraintPhysSyncSeen.clear();
    for (let i = 0; i < slab.count; i++) {
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        if (!constraintPhysSyncSeen.has(physIdA)) {
            constraintPhysSyncSeen.add(physIdA);
            writeActiveKineticBodySlabPose(slab.bodyA[i]);
        }
        if (!constraintPhysSyncSeen.has(physIdB)) {
            constraintPhysSyncSeen.add(physIdB);
            writeActiveKineticBodySlabPose(slab.bodyB[i]);
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
    const list = session.kineticConstraints;
    bucketPoolUseCount = 0;
    itemPoolUseCount = 0;
    let bucketCount = 0;
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance" && entry.type !== "angle") continue;
        const bodyA = entry.bodyA;
        const bodyB = entry.bodyB;
        if (bodyA.isDead || bodyB.isDead) continue;
        if (!bodyA.strategy?.isKinetic || !bodyB.strategy?.isKinetic) continue;
        let root = bodyA.id;
        if (bodyA._physId !== undefined) {
            const r = kineticDynamicSlab.islandRoot[bodyA._physId];
            if (r !== -1) root = r;
        }
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
                gatherBuckets[bucketIdx] = getPoolArray();
            }
        if (bucketIdx !== -1) {
            const item = getPoolItem();
            item.entry = entry;
            item.bodyA = bodyA;
            item.bodyB = bodyB;
            gatherBuckets[bucketIdx].push(item);
        }
    }
    awakeGroups.length = 0;
    asleepGroups.length = 0;
    for (let i = 0; i < bucketCount; i++) {
        const items = gatherBuckets[i];
        const ordered = orderIslandConstraintItems(items);
        if (islandItemsAsleep(ordered)) {
            const groupCopy = getPoolArray();
            for (let j = 0; j < ordered.length; j++) groupCopy.push(ordered[j]);
            asleepGroups.push(groupCopy);
        } else {
            const groupCopy = getPoolArray();
            for (let j = 0; j < ordered.length; j++) groupCopy.push(ordered[j]);
            awakeGroups.push(groupCopy);
        }
    }
    for (let g = 0; g < awakeGroups.length; g++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        appendIslandConstraintGroup(slab, awakeGroups[g]);
    }
    slab.activeCount = slab.count;
    for (let g = 0; g < asleepGroups.length; g++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        appendIslandConstraintGroup(slab, asleepGroups[g]);
    }
    syncConstraintSlabBodies(slab);
}
function linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, segment) {
    const reach = capsuleRadius + segment.size * 0.75;
    const minX = Math.min(ax, bx) - reach;
    const maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach;
    const maxY = Math.max(ay, by) + reach;
    return segment.x >= minX && segment.x <= maxX && segment.y >= minY && segment.y <= maxY;
}
function mergeWallCandidatesInto(candidates, out) {
    for (let i = 0; i < candidates.length; i++) {
        const seg = candidates[i];
        if (islandLinkWallSegmentSet.has(seg)) continue;
        islandLinkWallSegmentSet.add(seg);
        out.push(seg);
    }
}
function appendBodyWallCandidates(spatialFrame, body, gatherMark, out) {
    if (body._linkWallGatherMark === gatherMark) return;
    body._linkWallGatherMark = gatherMark;
    mergeWallCandidatesInto(spatialFrame.getWallCandidates(body), out);
}
function gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, out) {
    out.length = 0;
    islandLinkWallSegmentSet.clear();
    for (let i = start; i < start + count; i++) {
        appendBodyWallCandidates(spatialFrame, slab.bodyA[i], gatherMark, out);
        appendBodyWallCandidates(spatialFrame, slab.bodyB[i], gatherMark, out);
    }
}
function collectLinkOverlappingWalls(ax, ay, bx, by, capsuleRadius, walls, out) {
    out.length = 0;
    for (let i = 0; i < walls.length; i++) {
        const seg = walls[i];
        if (linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, seg)) out.push(seg);
    }
}
function shouldProjectLinkCapsuleAgainstWalls(slab, i, capsuleRadius, islandWalls, linkWallsOut) {
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    if (bodyA.isSleeping && bodyB.isSleeping) {
        linkWallsOut.length = 0;
        return false;
    }
    const dynSlab = kineticDynamicSlab;
    const wa = worldAnchorFromSlab(bodyA, slab.physIdA[i], slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
    const wb = worldAnchorFromSlab(bodyB, slab.physIdB[i], slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
    collectLinkOverlappingWalls(wa.x, wa.y, wb.x, wb.y, capsuleRadius, islandWalls, linkWallsOut);
    return linkWallsOut.length > 0;
}
function translateLinkAwayFromSlabWall(physIdA, physIdB, normalX, normalY, overlap, pinnedA, pinnedB) {
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        applySlabPositionCorrection(physIdB, normalX, normalY, overlap);
        return;
    }
    if (pinnedB) {
        applySlabPositionCorrection(physIdA, normalX, normalY, overlap);
        return;
    }
    applySlabPositionCorrection(physIdA, normalX, normalY, overlap);
    applySlabPositionCorrection(physIdB, normalX, normalY, overlap);
}
function projectDistanceLinkCapsuleAgainstWalls(slab, i, linkWalls, spatialFrame) {
    if (!linkWalls.length) return;
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const pinnedA = slab.static.pinnedA[i];
    const pinnedB = slab.static.pinnedB[i];
    const capsuleRadius = slab.static.capsuleRadius[i];
    const approachX = ((bodyA.vx ?? 0) + (bodyB.vx ?? 0)) * 0.5;
    const approachY = ((bodyA.vy ?? 0) + (bodyB.vy ?? 0)) * 0.5;
    const dynSlab = kineticDynamicSlab;
    for (let pass = 0; pass < LINK_CAPSULE_WALL_PASSES; pass++) {
        const wa = worldAnchorFromSlab(bodyA, physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
        const wb = worldAnchorFromSlab(bodyB, physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
        let best = null;
        for (let j = 0; j < linkWalls.length; j++) {
            const seg = linkWalls[j];
            if (!linkSegmentOverlapsWall(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg)) continue;
            const penetration = getLinkCapsuleSegmentPenetration(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg, { approachX, approachY });
            if (!penetration || penetration.overlap <= 0) continue;
            if (!best || penetration.overlap > best.overlap) best = { ...penetration, segment: seg };
        }
        if (!best) break;
        translateLinkAwayFromSlabWall(physIdA, physIdB, best.normalX, best.normalY, best.overlap, pinnedA, pinnedB);
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
        if (!islandWalls.length) continue;
        for (let pass = 0; pass < 2; pass++)
            for (let i = start; i < start + count; i++) {
                if (slab.type[i] === "angle") continue;
                if (!shouldProjectLinkCapsuleAgainstWalls(slab, i, slab.static.capsuleRadius[i], islandWalls, linkWalls)) continue;
                projectDistanceLinkCapsuleAgainstWalls(slab, i, linkWalls, spatialFrame);
            }
    }
}
function projectDistanceConstraint(slab, index) {
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const dynSlab = kineticDynamicSlab;
    const wa = worldAnchorFromSlab(slab.bodyA[index], physIdA, slab.static.anchorAx[index], slab.static.anchorAy[index], dynSlab, anchorAWorld);
    const wb = worldAnchorFromSlab(slab.bodyB[index], physIdB, slab.static.anchorBx[index], slab.static.anchorBy[index], dynSlab, anchorBWorld);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - slab.static.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, -error);
}
function projectAngleConstraint(slab, index) {
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    if (bodyA.isSleeping && bodyB.isSleeping) return;
    const facingA = bodyA.facing ?? 0;
    const facingB = bodyB.facing ?? 0;
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
    if (slab.type[index] === "angle") projectAngleConstraint(slab, index);
    else projectDistanceConstraint(slab, index);
}
function solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.dynamic.k[index];
    if (k <= 1e-12) return 0;
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
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
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
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
    if (slab.type[index] === "angle") return solveAngleConstraintVelocity(slab, index, spatialFrame, velocityBias);
    else return solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias);
}
function projectKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    for (let i = 0; i < slab.activeCount; i += 2) projectConstraint(slab, i);
    for (let i = 1; i < slab.activeCount; i += 2) projectConstraint(slab, i);
}
function warmStartDistanceConstraint(slab, i, dynSlab) {
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const wa = worldAnchorFromSlab(bodyA, physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
    const wb = worldAnchorFromSlab(bodyB, physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
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
        const rax = wa.x - dynSlab.x[physIdA];
        const ray = wa.y - dynSlab.y[physIdA];
        const rbx = wb.x - dynSlab.x[physIdB];
        const rby = wb.y - dynSlab.y[physIdB];
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
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const facingA = bodyA.facing ?? 0;
    const facingB = bodyB.facing ?? 0;
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
    if (slab.type[i] === "angle") warmStartAngleConstraint(slab, i, dynSlab);
    else warmStartDistanceConstraint(slab, i, dynSlab);
}
function warmStartKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    for (let i = 0; i < slab.activeCount; i++) warmStartConstraint(slab, i, dynSlab);
}
function solveKineticConstraintSlab(spatialFrame) {
    const slab = kineticConstraintSlab;
    if (slab.activeCount === 0) return;
    const constraintSettings = collisionSettings.kineticConstraints;
    const { contactImpulseEpsilon } = collisionSettings.kineticEarlyOut;
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
    for (let i = 0; i < slab.activeCount; i++) slab.entry[i].accumulatedImpulse = slab.dynamic.accumulatedImpulse[i];
}
function gatheredConstraintSlabHasEvictedBodies(spatialFrame, slab) {
    const entities = spatialFrame.entityGrid.entities;
    for (let i = 0; i < slab.activeCount; i++) {
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        if (bodyA._physId === undefined || bodyB._physId === undefined) return true;
        if (entities[slab.physIdA[i]] !== bodyA || entities[slab.physIdB[i]] !== bodyB) return true;
    }
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
    solveKineticConstraintSlab(spatialFrame);
}
export function measureConstraintSlabMaxError() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    let max = 0;
    for (let i = 0; i < slab.activeCount; i++) {
        if (slab.type[i] === "angle") continue;
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        const wa = worldAnchorFromSlab(bodyA, slab.physIdA[i], slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
        const wb = worldAnchorFromSlab(bodyB, slab.physIdB[i], slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
        const error = Math.abs(Math.hypot(wb.x - wa.x, wb.y - wa.y) - slab.static.restLength[i]);
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
    const list = listKineticConstraints(session);
    const adjacency = new Map();
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        addAdjacencyEdge(adjacency, entry.bodyAId, entry.bodyBId);
        addAdjacencyEdge(adjacency, entry.bodyBId, entry.bodyAId);
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
export function addDistanceConstraint(session, { bodyA, bodyB, anchorA = { x: 0, y: 0 }, anchorB = { x: 0, y: 0 }, restLength }) {
    const constraint = { id: session.nextConstraintId++, type: "distance", bodyAId: bodyA.id, bodyBId: bodyB.id, bodyA, bodyB, anchorA: { x: anchorA.x, y: anchorA.y }, anchorB: { x: anchorB.x, y: anchorB.y }, restLength, accumulatedImpulse: 0 };
    session.kineticConstraints.push(constraint);
    markKineticConstraintsDirty(session);
    return constraint;
}
export function addAngleConstraint(session, { bodyA, bodyB, referenceAngle }) {
    const constraint = { id: session.nextConstraintId++, type: "angle", bodyAId: bodyA.id, bodyBId: bodyB.id, bodyA, bodyB, referenceAngle, accumulatedImpulse: 0 };
    session.kineticConstraints.push(constraint);
    markKineticConstraintsDirty(session);
    return constraint;
}
export function removeKineticConstraint(session, constraintId) {
    const list = session.kineticConstraints;
    const index = list.findIndex((entry) => entry.id === constraintId);
    if (index >= 0) {
        list.splice(index, 1);
        markKineticConstraintsDirty(session);
    }
}
export function clearKineticConstraints(session) {
    if (session.kineticConstraints.length === 0) return;
    session.kineticConstraints.length = 0;
    markKineticConstraintsDirty(session);
}
export function pruneKineticConstraintsForBody(session, bodyId) {
    const list = session.kineticConstraints;
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === bodyId || entry.bodyBId === bodyId) {
            list.splice(i, 1);
            changed = true;
        }
    }
    if (changed) markKineticConstraintsDirty(session);
}
export function listKineticConstraints(session) {
    return session.kineticConstraints;
}
export function collectKineticConstraintsSnapshot(session, propIdToIndex) {
    const entries = [];
    const list = listKineticConstraints(session);
    for (let i = 0; i < list.length; i++) {
        const constraint = list[i];
        const bodyA = propIdToIndex.get(constraint.bodyAId);
        const bodyB = propIdToIndex.get(constraint.bodyBId);
        if (bodyA == null || bodyB == null) continue;
        const entry = { type: constraint.type ?? "distance", bodyA, bodyB, accumulatedImpulse: constraint.accumulatedImpulse };
        if (constraint.type === "angle") entry.referenceAngle = constraint.referenceAngle;
        else {
            entry.restLength = constraint.restLength;
            entry.anchorA = { x: constraint.anchorA.x, y: constraint.anchorA.y };
            entry.anchorB = { x: constraint.anchorB.x, y: constraint.anchorB.y };
        }
        entries.push(entry);
    }
    return entries;
}
export function applyKineticConstraintsFromSnapshot(session, entries, propRefsByIndex) {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const type = entry.type ?? "distance";
        let constraint;
        if (type === "angle") constraint = addAngleConstraint(session, { bodyA: propRefsByIndex[entry.bodyA], bodyB: propRefsByIndex[entry.bodyB], referenceAngle: entry.referenceAngle });
        else constraint = addDistanceConstraint(session, { bodyA: propRefsByIndex[entry.bodyA], bodyB: propRefsByIndex[entry.bodyB], restLength: entry.restLength, anchorA: entry.anchorA, anchorB: entry.anchorB });
        constraint.accumulatedImpulse = entry.accumulatedImpulse || 0;
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
const distAnchorA = { x: 0, y: 0 };
const distAnchorB = { x: 0, y: 0 };
export function worldAnchorFromBody(body, localX, localY, dst) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto(dst, body.x, body.y, localX, localY, cos, sin);
}
export function worldAnchorFromSlab(body, physId, localX, localY, slab, dst) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto(dst, slab.x[physId], slab.y[physId], localX, localY, cos, sin);
}
export function distanceBetweenAnchors(bodyA, anchorA, bodyB, anchorB) {
    worldAnchorFromBody(bodyA, anchorA.x, anchorA.y, distAnchorA);
    worldAnchorFromBody(bodyB, anchorB.x, anchorB.y, distAnchorB);
    return Math.hypot(distAnchorB.x - distAnchorA.x, distAnchorB.y - distAnchorA.y);
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
const WARM_START_CACHE_SIZE = 16384;
const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1;
const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
const warmStartGen = new Int32Array(WARM_START_CACHE_SIZE);
const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
let warmStartGeneration = 1;
const kineticContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CONTACTS),
    physIdB: new Int32Array(MAX_CONTACTS),
    dynamic: { nx: new Float32Array(MAX_CONTACTS), ny: new Float32Array(MAX_CONTACTS), rax: new Float32Array(MAX_CONTACTS), ray: new Float32Array(MAX_CONTACTS), rbx: new Float32Array(MAX_CONTACTS), rby: new Float32Array(MAX_CONTACTS), preDvx: new Float32Array(MAX_CONTACTS), preDvy: new Float32Array(MAX_CONTACTS), rAn: new Float32Array(MAX_CONTACTS), rBn: new Float32Array(MAX_CONTACTS), rAt: new Float32Array(MAX_CONTACTS), rBt: new Float32Array(MAX_CONTACTS), jn: new Float32Array(MAX_CONTACTS), jt: new Float32Array(MAX_CONTACTS), resting: new Uint8Array(MAX_CONTACTS) },
    static: { tier: new Uint8Array(MAX_CONTACTS), invMassA: new Float32Array(MAX_CONTACTS), invMassB: new Float32Array(MAX_CONTACTS), invIA: new Float32Array(MAX_CONTACTS), invIB: new Float32Array(MAX_CONTACTS), kNormal: new Float32Array(MAX_CONTACTS), kTangent: new Float32Array(MAX_CONTACTS), restitution: new Float32Array(MAX_CONTACTS), friction: new Float32Array(MAX_CONTACTS), featureA: new Uint8Array(MAX_CONTACTS), featureB: new Uint8Array(MAX_CONTACTS), warmStartKey: new Float64Array(MAX_CONTACTS) },
    reset() {
        this.count = 0;
    },
};
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
        if (warmStartGen[idx] !== warmStartGeneration) return -1;
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
    warmStartGeneration++;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        let idx = warmStartCacheIndex(key);
        while (true) {
            if (warmStartGen[idx] !== warmStartGeneration || warmStartKeys[idx] === key) {
                warmStartGen[idx] = warmStartGeneration;
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
function narrowPhaseSatContact(spatialFrame, pairs, pairIndex, contacts) {
    const physIdA = pairs.physIdA[pairIndex];
    const physIdB = pairs.physIdB[pairIndex];
    const bodyA = spatialFrame.entityGrid.entities[physIdA]?._physId === physIdA ? spatialFrame.entityGrid.entities[physIdA] : null;
    const bodyB = spatialFrame.entityGrid.entities[physIdB]?._physId === physIdB ? spatialFrame.entityGrid.entities[physIdB] : null;
    if (!bodyA || !bodyB) return;
    const slab = kineticDynamicSlab;
    const collided = checkEntityPairCollisionAtSlabPose(bodyA, bodyB, physIdA, physIdB, slab.x[physIdA], slab.y[physIdA], slab.x[physIdB], slab.y[physIdB]);
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
        else narrowPhaseSatContact(spatialFrame, pairs, i, contacts);
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
    return { innerIterations: iterationsRun, maxImpulse: solveMaxImpulse, restingCount };
}
function applyKineticContactWake(contacts, spatialFrame) {
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = spatialFrame.entityGrid.entities[contacts.physIdA[i]]?._physId === contacts.physIdA[i] ? spatialFrame.entityGrid.entities[contacts.physIdA[i]] : null;
        const bodyB = spatialFrame.entityGrid.entities[contacts.physIdB[i]]?._physId === contacts.physIdB[i] ? spatialFrame.entityGrid.entities[contacts.physIdB[i]] : null;
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
export const sleepContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CONTACTS),
    physIdB: new Int32Array(MAX_CONTACTS),
    resting: new Uint8Array(MAX_CONTACTS),
    _index: new Map(),
    reset() {
        this.count = 0;
        this._index.clear();
    },
    add(idA, idB, isResting) {
        const key = pairPhysKey(idA, idB);
        const existing = this._index.get(key);
        if (existing !== undefined) {
            if (isResting) this.resting[existing] = 1;
            return;
        }
        if (this.count < MAX_CONTACTS) {
            this._index.set(key, this.count);
            this.physIdA[this.count] = idA;
            this.physIdB[this.count] = idB;
            this.resting[this.count] = isResting ? 1 : 0;
            this.count++;
        }
    },
};
export function resolveKineticContactPassWithPairs(tick, pairs) {
    const spatialFrame = tick.frame;
    const contacts = kineticContactBuffer;
    narrowPhaseKineticContacts(spatialFrame, pairs, contacts);
    if (contacts.count === 0) return contacts;
    precomputeKineticContacts(spatialFrame, contacts);
    const restingCount = warmStartKineticContacts(contacts);
    const solveStats = solveKineticContactVelocities(contacts, INNER_SOLVE_ITERATIONS, restingCount);
    solveStats.contactCount = contacts.count;
    tick.world.kinetic.kineticContactStats = solveStats;
    storeKineticWarmStartCache(contacts);
    applyKineticContactWake(contacts, spatialFrame);
    for (let i = 0; i < contacts.count; i++) sleepContactBuffer.add(contacts.physIdA[i], contacts.physIdB[i], contacts.dynamic.resting[i] === 1);
    return contacts;
}
export const KINETIC_PAIR_TIER = { CIRCLE_CIRCLE: 0, CIRCLE_POLY: 1, POLY_POLY: 2, COMPOUND: 3 };
export function classifyKineticPairTier(bodyA, bodyB) {
    if (bodyA.collisionParts?.length > 1 || bodyB.collisionParts?.length > 1) return KINETIC_PAIR_TIER.COMPOUND;
    const shapeA = bodyA.collisionParts?.[0] ?? bodyA.shape;
    const shapeB = bodyB.collisionParts?.[0] ?? bodyB.shape;
    if (shapeA?.shapeTypeId === SHAPE_TYPE_ID.Circle && shapeB?.shapeTypeId === SHAPE_TYPE_ID.Circle) return KINETIC_PAIR_TIER.CIRCLE_CIRCLE;
    if (shapeA?.shapeTypeId === SHAPE_TYPE_ID.Circle || shapeB?.shapeTypeId === SHAPE_TYPE_ID.Circle) return KINETIC_PAIR_TIER.CIRCLE_POLY;
    return KINETIC_PAIR_TIER.POLY_POLY;
}
const PAIR_BODY_KEY_SCALE = 1_000_000;
function createKineticPairBuffer() {
    return {
        count: 0,
        physIdA: new Int32Array(MAX_KINETIC_PAIRS),
        physIdB: new Int32Array(MAX_KINETIC_PAIRS),
        static: { tier: new Uint8Array(MAX_KINETIC_PAIRS) },
        reset() {
            this.count = 0;
        },
    };
}
const kineticPairBuffer = createKineticPairBuffer();
const persistedKineticPairBuffer = createKineticPairBuffer();
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
const PAIR_HASH_CAPACITY = MAX_KINETIC_PAIRS * 2;
const pairHashKeys = new Float64Array(PAIR_HASH_CAPACITY);
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
        const bodyA = spatialFrame.entityGrid.entities[physIdA]?._physId === physIdA ? spatialFrame.entityGrid.entities[physIdA] : null;
        const bodyB = spatialFrame.entityGrid.entities[physIdB]?._physId === physIdB ? spatialFrame.entityGrid.entities[physIdB] : null;
        if (bodyA && bodyB && areKineticLinkNeighbors(bodyA, bodyB)) continue;
        const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
        if (!overlaps) continue;
        if (!shouldResolveKineticPairSlab(physIdA, physIdB, overlaps)) continue;
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
    clearPairHash();
    for (let i = 0; i < pairs.count; i++) addPairHash(pairPhysKey(pairs.physIdA[i], pairs.physIdB[i]));
    let added = 0;
    let seenCount = 0;
    const seenPrimary = spatialFrame._patchPrimarySeen;
    const seenPrimaryIds = spatialFrame._patchPrimarySeenIds;
    for (let i = 0; i < bodies.length; i++) {
        const primary = bodies[i];
        const physIdA = primary._physId;
        if (physIdA === undefined) continue;
        if (seenPrimary[physIdA]) continue;
        seenPrimary[physIdA] = 1;
        seenPrimaryIds[seenCount++] = physIdA;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const key = pairPhysKey(physIdA, physIdB);
            if (hasPairHash(key)) continue;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (areKineticLinkNeighbors(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) {
                for (let k = 0; k < seenCount; k++) seenPrimary[seenPrimaryIds[k]] = 0;
                return added;
            }
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = tier;
            addPairHash(key);
            added++;
        }
    }
    for (let k = 0; k < seenCount; k++) seenPrimary[seenPrimaryIds[k]] = 0;
    return added;
}
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    pairs.reset();
    const slab = kineticDynamicSlab;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physIdA = slab.activePhysIds[i];
        const primary = spatialFrame.entityGrid.entities[physIdA]?._physId === physIdA ? spatialFrame.entityGrid.entities[physIdA] : null;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (areKineticLinkNeighbors(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) continue;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = tier;
        }
    }
}
export function separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    const pinnedA = statSlab.pinned[physIdA];
    const pinnedB = statSlab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        dynSlab.x[physIdB] += nx * overlap;
        dynSlab.y[physIdB] += ny * overlap;
        return;
    }
    if (pinnedB) {
        dynSlab.x[physIdA] -= nx * overlap;
        dynSlab.y[physIdA] -= ny * overlap;
        return;
    }
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
    const pinnedA = statSlab.pinned[physIdA];
    const pinnedB = statSlab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        dynSlab.x[physIdB] += overlap;
        return;
    }
    if (pinnedB) {
        dynSlab.x[physIdA] -= overlap;
        return;
    }
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
        sleepContactBuffer.reset();
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
        tick.world.kinetic.kineticSolverStats = { outerIterations: outerIterationsRun, maxIterations: kineticIterations, pairCount: persistedKineticPairBuffer.count };
    } else tick.world.kinetic.kineticSolverStats = { outerIterations: 0, maxIterations: kineticIterations, pairCount: 0 };
}
export function runKineticPhysics(tick, dt, hooks) {
    const world = tick.world;
    world.simulationFrameHooks?.beforePhysics?.(world);
    const spatialFrame = tick.frame;
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
    delete body._kineticLinkNeighbors;
    delete body._kineticIslandPeers;
    delete body._kineticIslandRoot;
}
export function bakeKineticIslandPlan(session, kineticBodies) {
    const adjacent = getGraphCache(session).adjacency;
    const bodyById = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        bodyById.set(body.id, body);
        clearBodyIslandFields(body);
        if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = -1;
    }
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const neighborIds = adjacent.get(body.id);
        let linkNeighbors = null;
        if (neighborIds)
            for (let j = 0; j < neighborIds.length; j++) {
                const neighbor = bodyById.get(neighborIds[j]);
                if (!neighbor) continue;
                if (!linkNeighbors) linkNeighbors = [];
                linkNeighbors.push(neighbor);
            }
        if (linkNeighbors) body._kineticLinkNeighbors = linkNeighbors;
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
            if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = root;
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
export function areKineticLinkNeighbors(bodyA, bodyB) {
    const neighbors = bodyA._kineticLinkNeighbors;
    if (!neighbors) return false;
    for (let i = 0; i < neighbors.length; i++) if (neighbors[i] === bodyB) return true;
    return false;
}
const parent = new Int32Array(MAX_PHYS_BODIES);
const rank = new Int32Array(MAX_PHYS_BODIES);
const componentRoot = new Int32Array(MAX_PHYS_BODIES);
const componentMaxSpeedSq = new Float32Array(MAX_PHYS_BODIES);
const componentHasBlocker = new Uint8Array(MAX_PHYS_BODIES);
const componentMemberCount = new Int32Array(MAX_PHYS_BODIES);
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
const ISLAND_SLEEP_QUERY_BOUNDS = createAabb();
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
    const linked = entity._kineticLinkNeighbors;
    if (linked?.length) {
        for (let i = 0; i < linked.length; i++) {
            const peer = linked[i];
            if (peer === entity) continue;
            peer._sleepFrames = 0;
            peer.isSleeping = false;
        }
        return;
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
export function hasSleepBlockingNeighbor(prop, neighbors) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === prop || !other.strategy?.isKinetic) continue;
        if (shareKineticIsland(prop, other)) continue;
        if (!pairBroadphaseOverlapSlab(prop._physId, other._physId)) continue;
        if (other.isSleeping) continue;
        if (isKinematicallyActive(other)) return true;
    }
    return false;
}
export function evaluateKineticSleepEligible(prop, neighbors) {
    return canSleepKinetic(prop) && !hasSleepBlockingNeighbor(prop, neighbors);
}
export function evaluateKineticIslandSleepEligible(islandMembers, spatialFrame) {
    emptyAabbInto(ISLAND_SLEEP_QUERY_BOUNDS);
    for (let i = 0; i < islandMembers.length; i++) {
        const prop = islandMembers[i];
        if (!canSleepKinetic(prop)) return false;
        const extent = entityCollisionSpan(prop);
        growAabbFromCenterInto(ISLAND_SLEEP_QUERY_BOUNDS, prop.x, prop.y, extent, extent);
    }
    const neighbors = spatialFrame.collectEntitiesInBounds(ISLAND_SLEEP_QUERY_BOUNDS);
    for (let i = 0; i < islandMembers.length; i++) if (hasSleepBlockingNeighbor(islandMembers[i], neighbors)) return false;
    return true;
}
/**
 * Continuous world acceleration (units/s²) — same semantics as floor belts.
 * Not mass-weighted; instant velocity changes use direct vx/vy writes at contact sites.
 *
 * @param {{ vx?: number, vy?: number }} body
 * @param {number} ax
 * @param {number} ay
 * @param {number} dtSec
 */
export function applyAcceleration(body, ax, ay, dtSec) {
    if (body.vx === undefined || body.vy === undefined) return;
    body.vx += ax * dtSec;
    body.vy += ay * dtSec;
}
/**
 * @param {object} body
 * @param {number} ax
 * @param {number} ay
 * @param {number} dtSec
 */
export function applyKineticAcceleration(body, ax, ay, dtSec) {
    if (body.ax === undefined || body.ay === undefined) {
        body.vx = (body.vx ?? 0) + ax * dtSec;
        body.vy = (body.vy ?? 0) + ay * dtSec;
        wakeKineticBody(body);
        return;
    }
    body.ax += ax;
    body.ay += ay;
    wakeKineticBody(body);
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
    if (body.ax || body.ay) {
        body.vx = (body.vx ?? 0) + body.ax * (dtMs / 1000);
        body.vy = (body.vy ?? 0) + body.ay * (dtMs / 1000);
    }
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
        body.facing = (body.facing ?? 0) + body.angularVelocity * (dtMs / 1000);
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
const LOCAL_SCRATCH = { localX: 0, localY: 0, halfX: 0, halfY: 0 };
const ROTATE_SCRATCH_A = { x: 0, y: 0 };
const ROTATE_SCRATCH_B = { x: 0, y: 0 };
const CLOSEST_POINT_SCRATCH = { x: 0, y: 0 };
const CIRCLE_SCRATCH = { x: 0, y: 0, radius: 0 };
const LOCAL_APPROACH_SCRATCH = { x: 0, y: 0 };
const LOCAL_BOX_SURFACE_SCRATCH = { x: 0, y: 0 };
const PUSH_NORMAL_SCRATCH = { x: 0, y: 0 };
const INSIDE_APPROACH_SCRATCH = { nx: 0, ny: 0, dist: 0 };
const WORLD_NORMAL_SCRATCH = { x: 0, y: 0 };
const SEGMENT_PEN = new Float32Array(4);
export function toSegmentLocal(segment, x, y, out = LOCAL_SCRATCH) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    const halfX = (segment.width !== undefined ? segment.width : segment.size) * 0.5;
    const halfY = (segment.height !== undefined ? segment.height : segment.size) * 0.5;
    out.halfX = halfX;
    out.halfY = halfY;
    out.localX = dx * cos - dy * sin;
    out.localY = dx * sin + dy * cos;
    return out;
}
export function closestPointOnSegment(wall, x, y, out = CLOSEST_POINT_SCRATCH) {
    const dx = x - wall.x;
    const dy = y - wall.y;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const halfX = (wall.width !== undefined ? wall.width : wall.size) * 0.5;
    const halfY = (wall.height !== undefined ? wall.height : wall.size) * 0.5;
    let localX = dx * cos - dy * sin;
    let localY = dx * sin + dy * cos;
    localX = Math.max(-halfX, Math.min(halfX, localX));
    localY = Math.max(-halfY, Math.min(halfY, localY));
    return transformPoint2DInto(out, wall.x, wall.y, localX, localY, cos, -sin);
}
export function distanceSqToSegment(segment, x, y) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    const halfX = (segment.width !== undefined ? segment.width : segment.size) * 0.5;
    const halfY = (segment.height !== undefined ? segment.height : segment.size) * 0.5;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const closestX = Math.max(-halfX, Math.min(localX, halfX));
    const closestY = Math.max(-halfY, Math.min(localY, halfY));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    return distDX * distDX + distDY * distDY;
}
export function distanceToSegment(wall, x, y) {
    const distSq = distanceSqToSegment(wall, x, y);
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
export function minDistanceSegmentToWall(ax, ay, bx, by, wall) {
    const halfX = (wall.width !== undefined ? wall.width : wall.size) * 0.5;
    const halfY = (wall.height !== undefined ? wall.height : wall.size) * 0.5;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const a = rotateXYInto(ROTATE_SCRATCH_A, ax - wall.x, ay - wall.y, cos, sin);
    const b = rotateXYInto(ROTATE_SCRATCH_B, bx - wall.x, by - wall.y, cos, sin);
    return minDistanceSegmentToAabb(a.x, a.y, b.x, b.y, -halfX, -halfY, halfX, halfY);
}
/** Closest point on path segment AB to wall box — used for push direction. */
export function findClosestPointOnPathToWall(ax, ay, bx, by, wall) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.01) return { x: ax, y: ay, t: 0, dist: distanceToSegment(wall, ax, ay) };
    const samples = Math.min(256, Math.max(16, Math.ceil(segLen)));
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const dist = distanceToSegment(wall, px, py);
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
        const d1 = distanceToSegment(wall, ax + (bx - ax) * m1, ay + (by - ay) * m1);
        const d2 = distanceToSegment(wall, ax + (bx - ax) * m2, ay + (by - ay) * m2);
        if (d1 < d2) hi = m2;
        else lo = m1;
    }
    const t = (lo + hi) / 2;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    return { x, y, t, dist: distanceToSegment(wall, x, y) };
}
export function circleIntersectsSegment(circle, segment) {
    const radiusSq = circle.radius * circle.radius;
    return distanceSqToSegment(segment, circle.x, circle.y) < radiusSq;
}
/**
 * Closest point on an axis-aligned box boundary (segment-local space).
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} halfX
 * @param {number} halfY
 */
function closestPointOnLocalBoxSurface(localX, localY, halfX, halfY, out = LOCAL_BOX_SURFACE_SCRATCH) {
    const insideX = localX > -halfX && localX < halfX;
    const insideY = localY > -halfY && localY < halfY;
    if (!insideX || !insideY) {
        out.x = Math.max(-halfX, Math.min(localX, halfX));
        out.y = Math.max(-halfY, Math.min(localY, halfY));
        return out;
    }
    const distToLeft = localX + halfX;
    const distToRight = halfX - localX;
    const distToTop = localY + halfY;
    const distToBottom = halfY - localY;
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    const eps = 1e-6;
    out.x = localX;
    out.y = localY;
    if (Math.abs(minDist - distToLeft) <= eps) out.x = -halfX;
    if (Math.abs(minDist - distToRight) <= eps) out.x = halfX;
    if (Math.abs(minDist - distToTop) <= eps) out.y = -halfY;
    if (Math.abs(minDist - distToBottom) <= eps) out.y = halfY;
    return out;
}
/**
 * Outward push normal for a point on an axis-aligned box surface (segment-local space).
 *
 * @param {number} sx
 * @param {number} sy
 * @param {number} halfX
 * @param {number} halfY
 */
function pushNormalAtLocalBoxSurface(sx, sy, halfX, halfY, out = PUSH_NORMAL_SCRATCH) {
    const eps = 1e-4;
    let nx = 0;
    let ny = 0;
    if (Math.abs(sx + halfX) < eps) nx -= 1;
    if (Math.abs(sx - halfX) < eps) nx += 1;
    if (Math.abs(sy + halfY) < eps) ny -= 1;
    if (Math.abs(sy - halfY) < eps) ny += 1;
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) {
        out.x = 0;
        out.y = 1;
        return out;
    }
    out.x = nx / len;
    out.y = ny / len;
    return out;
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
function pushNormalFromInsideApproach(localX, localY, halfX, halfY, approachX, approachY, out = INSIDE_APPROACH_SCRATCH) {
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
        out.nx = bestNx;
        out.ny = bestNy;
        out.dist = bestDist;
        return out;
    }
    const surface = closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, halfX, halfY);
    out.nx = fn.x;
    out.ny = fn.y;
    out.dist = Math.min(leftDist, rightDist, topDist, bottomDist);
    return out;
}
/** @param {object} segment @param {number} worldX @param {number} worldY */
/** @param {object} segment @param {number} worldVx @param {number} worldVy */
function approachToSegmentLocal(segment, worldVx, worldVy, out = LOCAL_APPROACH_SCRATCH) {
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    return rotateXYInto(out, worldVx, worldVy, cos, sin);
}
/**
 * @param {object} circle
 * @param {object} segment
 * @param {{ approachX?: number, approachY?: number }} [options] — world-space motion hint for face selection
 */
export function getLinkCapsuleSegmentPenetration(ax, ay, bx, by, capsuleRadius, segment, { approachX = 0, approachY = 0 } = {}) {
    if (minDistanceSegmentToWall(ax, ay, bx, by, segment) >= capsuleRadius - 1e-5) return null;
    const closest = findClosestPointOnPathToWall(ax, ay, bx, by, segment);
    if (circleSegmentPenetration(closest.x, closest.y, capsuleRadius, segment, approachX, approachY)) return { normalX: SEGMENT_PEN[0], normalY: SEGMENT_PEN[1], overlap: SEGMENT_PEN[2], distanceSq: SEGMENT_PEN[3] };
    if (closest.dist >= capsuleRadius) return null;
    const wallPoint = closestPointOnSegment(segment, closest.x, closest.y);
    let normalX = closest.x - wallPoint.x;
    let normalY = closest.y - wallPoint.y;
    const len = Math.hypot(normalX, normalY);
    if (len < 1e-8) return null;
    normalX /= len;
    normalY /= len;
    return { normalX, normalY, overlap: capsuleRadius - closest.dist, distanceSq: closest.dist * closest.dist };
}
function circleSegmentPenetration(cx, cy, radius, segment, approachX = 0, approachY = 0) {
    const { localX, localY, halfX, halfY } = toSegmentLocal(segment, cx, cy);
    const localApproach = approachToSegmentLocal(segment, approachX, approachY);
    const hasApproach = Math.hypot(localApproach.x, localApproach.y) > 1e-6;
    const strictlyInside = localX > -halfX && localX < halfX && localY > -halfY && localY < halfY;
    const surface = closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    const toCenterX = localX - surface.x;
    const toCenterY = localY - surface.y;
    const distanceSq = toCenterX * toCenterX + toCenterY * toCenterY;
    const radiusSq = radius * radius;
    if (distanceSq > radiusSq + 1e-4) return false;
    let localNormX;
    let localNormY;
    let overlap;
    if (strictlyInside && hasApproach) {
        const face = pushNormalFromInsideApproach(localX, localY, halfX, halfY, localApproach.x, localApproach.y);
        localNormX = face.nx;
        localNormY = face.ny;
        overlap = radius - face.dist;
    } else if (distanceSq <= 1e-10) {
        const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, halfX, halfY);
        localNormX = fn.x;
        localNormY = fn.y;
        overlap = radius;
    } else {
        const distance = Math.sqrt(distanceSq);
        overlap = Math.max(0, radius - distance);
        localNormX = toCenterX / distance;
        localNormY = toCenterY / distance;
    }
    const invCos = Math.cos(segment.angle);
    const invSin = Math.sin(segment.angle);
    const worldNormal = rotateXYInto(WORLD_NORMAL_SCRATCH, localNormX, localNormY, invCos, invSin);
    SEGMENT_PEN[0] = worldNormal.x;
    SEGMENT_PEN[1] = worldNormal.y;
    SEGMENT_PEN[2] = overlap;
    SEGMENT_PEN[3] = distanceSq;
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
/** @param {number} vx @param {number} vy @param {number} angle */
function worldVectorToSegmentLocal(vx, vy, angle) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return rotateXY(vx, vy, cos, sin);
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
    const slab = (origin, dir, min, max) => {
        if (Math.abs(dir) < 1e-10) {
            if (origin < min || origin > max) return null;
            return { enter: -Infinity, exit: Infinity };
        }
        let t0 = (min - origin) / dir;
        let t1 = (max - origin) / dir;
        if (t0 > t1) {
            const tmp = t0;
            t0 = t1;
            t1 = tmp;
        }
        return { enter: t0, exit: t1 };
    };
    const sx = slab(ox, dx, minX, maxX);
    if (!sx) return null;
    const sy = slab(oy, dy, minY, maxY);
    if (!sy) return null;
    const tEnter = Math.max(sx.enter, sy.enter);
    const tExit = Math.min(sx.exit, sy.exit);
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
export function sweepCircleAgainstSegment(ox, oy, dx, dy, radius, segment, maxDist = Infinity) {
    const half = segment.size / 2;
    const { localX, localY } = toSegmentLocal(segment, ox, oy);
    const localDir = worldVectorToSegmentLocal(dx, dy, segment.angle);
    const t = rayExpandedLocalAabbHit(localX, localY, localDir.x, localDir.y, half, radius);
    if (t == null || t > maxDist) return null;
    const wx = ox + dx * t;
    const wy = oy + dy * t;
    let hit = circleSegmentPenetration(wx, wy, radius, segment, dx, dy);
    if (!hit) {
        const nudge = 1e-3;
        hit = circleSegmentPenetration(wx + dx * nudge, wy + dy * nudge, radius, segment, dx, dy);
    }
    if (!hit) return null;
    return { t, x: wx, y: wy, nx: SEGMENT_PEN[0], ny: SEGMENT_PEN[1], segment };
}
/**
 * Closest wall touch along a ray across many segments.
 *
 * @param {object[]} segments
 * @returns {CircleSegmentSweepHit | null}
 */
/**
 * Circle contact geometry — surface points for casts, previews, and impulse hooks.
 */
/** @param {number} cx @param {number} cy @param {number} radius @param {number} dirX @param {number} dirY — unit */
export function circleLeadingPoint(cx, cy, radius, dirX, dirY) {
    return { x: cx + dirX * radius, y: cy + dirY * radius };
}
/** Push-out wall normal (away from solid into free space). */
/** Point on circle A that faces circle B at first center–center contact. */
/** @type {{ w: number, x: number, y: number, z: number }} */
export const IDENTITY_ROLL_QUAT = { w: 1, x: 0, y: 0, z: 0 };
export function transformRollVertex(lx, ly, lz, radius, rollQuat = IDENTITY_ROLL_QUAT) {
    const rotated = rotateVecByQuat(lx, ly, lz - radius, rollQuat);
    return { lx: rotated.x, ly: rotated.y, z: rotated.z + radius };
}
export function getRollRadius(body) {
    return Math.max(1, resolveBodyRadius(body));
}
function integrateGroundRoll(body, dtMs) {
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = lengthXY(vx, vy);
    if (speed < 0.5) {
        if (body.rollQuat) body.rollQuat = dampQuatTwist(body.rollQuat, dtMs, 3.0);
        return;
    }
    const r = getRollRadius(body);
    const angle = -(speed / r) * (dtMs / 1000);
    const { nx: ax, ny: ay } = normalizeXY(-vy, vx);
    const delta = axisAngleQuat(ax, ay, 0, angle);
    const q = multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT);
    body.rollQuat = dampQuatTwist(normalizeQuat(q), dtMs, 1.8);
}
export function dampQuatTwist(q, dtMs, dampingRate = 1.8) {
    const w = q.w ?? 1;
    const x = q.x ?? 0;
    const y = q.y ?? 0;
    const z = q.z ?? 0;
    let w_t = w;
    let z_t = z;
    const len = Math.hypot(w_t, z_t);
    if (len < 1e-6) return q;
    w_t /= len;
    z_t /= len;
    const q_swing = multiplyQuat(q, { w: w_t, x: 0, y: 0, z: -z_t });
    const decay = Math.exp(-dampingRate * (dtMs / 1000));
    let z_t_new = z_t * decay;
    let w_t_new = w_t;
    const len_new = Math.hypot(w_t_new, z_t_new);
    if (len_new > 1e-6) {
        w_t_new /= len_new;
        z_t_new /= len_new;
    }
    return normalizeQuat(multiplyQuat(q_swing, { w: w_t_new, x: 0, y: 0, z: z_t_new }));
}
export function absorbCollisionRollImpulse(body, dtMs) {
    const w = body.angularVelocity ?? 0;
    if (Math.abs(w) < 0.02) return;
    const angle = -w * (dtMs / 1000);
    const delta = axisAngleQuat(0, 0, 1, angle);
    body.rollQuat = normalizeQuat(multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT));
}
export function quantizeRollQuat(rollQuat, steps = 16) {
    const q = rollQuat ?? IDENTITY_ROLL_QUAT;
    const angle = 2 * Math.acos(clamp(q.w ?? 1, -1, 1));
    if (angle < 1e-4) return IDENTITY_ROLL_QUAT;
    const s = Math.sin(angle * 0.5);
    if (Math.abs(s) < 1e-4) return IDENTITY_ROLL_QUAT;
    const ax = (q.x ?? 0) / s;
    const ay = (q.y ?? 0) / s;
    const heading = Math.atan2(ay, ax);
    const qAngle = quantizeAngle(angle, steps);
    const qHeading = quantizeAngle(heading, steps);
    return axisAngleQuat(Math.cos(qHeading), Math.sin(qHeading), 0, qAngle);
}
export function buildRollOrientKey(rollQuat, steps = 16) {
    const q = quantizeRollQuat(rollQuat, steps);
    const angle = 2 * Math.acos(clamp(q.w, -1, 1));
    if (angle < 1e-4) return "r0_0";
    const s = Math.sin(angle * 0.5);
    const heading = Math.atan2(q.y / s, q.x / s);
    const angleBucket = Math.round((angle / (Math.PI * 2)) * steps) % steps;
    const axisBucket = Math.round(((heading + Math.PI) / (Math.PI * 2)) * steps) % steps;
    return `r${angleBucket}_${axisBucket}`;
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
export function applyRollSpin(prop) {
    if (!prop.strategy?.rolls) return;
    const speed = Math.hypot(prop.vx, prop.vy);
    prop.angularVelocity = (speed / (prop.radius || 8)) * 0.12;
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
        applyRollSpin(prop);
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
    applyRollSpin(prop);
    wakeKineticBody(prop);
}
export function snapMoveTargetToCellCenter(grid, world) {
    const idx = grid.worldToIdx(world.x, world.y);
    if (idx === -1) return { worldX: world.x, worldY: world.y, idx: null };
    return { worldX: grid.gridCenterXByIdx(idx), worldY: grid.gridCenterYByIdx(idx), idx };
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
export function steerRollToward(prop, dirX, dirY, config, targetSpeed = null) {
    if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) return decelerateRoll(prop, config);
    const limitSpeed = targetSpeed !== null ? Math.min(config.maxSpeed, targetSpeed) : config.maxSpeed;
    prop._groundRollDrive = { kind: "thrust", dirX, dirY, accel: config.accel, maxSpeed: limitSpeed };
    wakeKineticBody(prop);
}
export function decelerateRoll(prop, config) {
    prop._groundRollDrive = { kind: "brake", accel: config.accel };
    wakeKineticBody(prop);
}
export function clearGroundRollDrive(prop) {
    delete prop._groundRollDrive;
}
