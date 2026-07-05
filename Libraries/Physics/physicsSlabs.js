import { collisionSettings } from "./physicsDefaults.js";
import { polygonSecondMomentAboutCentroid2D, polygonSignedArea2D, polygonCentroid2D } from "../Math/Poly2D.js";
import { createBroadphaseBounds, pairBroadphaseBoundsOverlap, BROADPHASE_KIND } from "./broadphase.js";
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
// --- MERGED FROM bodyMass.js ---
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
export function syncKineticRigidBody(body) {
    body.strategy?.syncCollisionShape?.(body);
    body.mass = kineticMassFromFootprint(body);
}
export function massFromBody(body) {
    if (body.mass == null) throw new Error("Kinetic body missing mass — call syncKineticRigidBody first");
    return body.mass;
}
export function inverseMassFromBody(body) {
    if (body.strategy?.pinned) return 0;
    return 1 / massFromBody(body);
}
export function momentOfInertiaFromBody(body) {
    return kineticInertiaFromBody(body);
}
export function bodyPinnedForContact(body) {
    return Boolean(body.strategy?.pinned);
}
// --- MERGED FROM kineticBodySlab.js ---
export const BP_KIND_CIRCLE = 0;
export const BP_KIND_OBB = 1;
export const kineticDynamicSlab = {
    x: new Float32Array(MAX_PHYS_BODIES),
    y: new Float32Array(MAX_PHYS_BODIES),
    vx: new Float32Array(MAX_PHYS_BODIES),
    vy: new Float32Array(MAX_PHYS_BODIES),
    w: new Float32Array(MAX_PHYS_BODIES),
    activeSlot: new Int32Array(MAX_PHYS_BODIES),
    activePhysIds: new Int32Array(MAX_PHYS_BODIES),
    activePhysCount: 0,
    islandRoot: new Int32Array(MAX_PHYS_BODIES),
    bpKind: new Uint8Array(MAX_PHYS_BODIES),
    r: new Float32Array(MAX_PHYS_BODIES),
    hx: new Float32Array(MAX_PHYS_BODIES),
    hy: new Float32Array(MAX_PHYS_BODIES),
    cos: new Float32Array(MAX_PHYS_BODIES),
    sin: new Float32Array(MAX_PHYS_BODIES),
};
export const kineticStaticSlab = {
    mass: new Float32Array(MAX_PHYS_BODIES),
    invMass: new Float32Array(MAX_PHYS_BODIES),
    invI: new Float32Array(MAX_PHYS_BODIES),
    pinned: new Uint8Array(MAX_PHYS_BODIES),
    entityId: new Int32Array(MAX_PHYS_BODIES),
    restitution: new Float32Array(MAX_PHYS_BODIES),
    friction: new Float32Array(MAX_PHYS_BODIES),
};
kineticDynamicSlab.activeSlot.fill(-1);
kineticDynamicSlab.islandRoot.fill(-1);
const SLAB_SCRATCH_A = { kind: 1, cx: 0, cy: 0, r: 0, hx: 0, hy: 0, cos: 1, sin: 0 };
const SLAB_SCRATCH_B = { kind: 1, cx: 0, cy: 0, r: 0, hx: 0, hy: 0, cos: 1, sin: 0 };
export function writeBroadphaseFromBounds(physId, bounds) {
    const slab = kineticDynamicSlab;
    if (bounds.kind === BROADPHASE_KIND.Circle) {
        slab.bpKind[physId] = BP_KIND_CIRCLE;
        slab.r[physId] = bounds.r;
        return;
    }
    slab.bpKind[physId] = BP_KIND_OBB;
    slab.hx[physId] = bounds.hx;
    slab.hy[physId] = bounds.hy;
    slab.cos[physId] = bounds.cos;
    slab.sin[physId] = bounds.sin;
}
export function writeActiveKineticBodySlabPose(body) {
    const physId = body._physId;
    const slab = kineticDynamicSlab;
    slab.x[physId] = body.x;
    slab.y[physId] = body.y;
    slab.vx[physId] = body.vx ?? 0;
    slab.vy[physId] = body.vy ?? 0;
    slab.w[physId] = body.angularVelocity ?? 0;
}
export function writeStaticKineticSlabSlot(body) {
    const physId = body._physId;
    const slab = kineticStaticSlab;
    slab.mass[physId] = massFromBody(body);
    slab.invMass[physId] = inverseMassFromBody(body);
    const moment = body.momentOfInertia;
    slab.invI[physId] = moment ? 1 / moment : 0;
    slab.pinned[physId] = bodyPinnedForContact(body) ? 1 : 0;
    slab.entityId[physId] = body.id;
    slab.restitution[physId] = body.strategy?.pairRestitution ?? -1;
    slab.friction[physId] = body.strategy?.pairFriction ?? body.strategy?.wallPhysics?.friction ?? -1;
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
export function writebackKineticBodySlabPhysId(spatialFrame, physId) {
    const slab = kineticDynamicSlab;
    const body = spatialFrame.entityGrid.entities[physId];
    body.x = slab.x[physId];
    body.y = slab.y[physId];
    body.vx = slab.vx[physId];
    body.vy = slab.vy[physId];
    body.angularVelocity = slab.w[physId];
    if (body.broadphaseSnapshot) body.broadphaseSnapshot.x = NaN;
}
export function writebackKineticBodySlabPhysIds(spatialFrame, physIds) {
    for (let i = 0; i < physIds.length; i++) writebackKineticBodySlabPhysId(spatialFrame, physIds[i]);
}
export function writebackActiveKineticBodySlab(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const physId = body._physId;
        body.x = slab.x[physId];
        body.y = slab.y[physId];
        body.vx = slab.vx[physId];
        body.vy = slab.vy[physId];
        body.angularVelocity = slab.w[physId];
        if (body.broadphaseSnapshot) body.broadphaseSnapshot.x = NaN;
    }
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
const SLAB_POSE_EPS = 1e-4;
const SLAB_VEL_EPS = 1e-4;
export function activeBodiesMatchKineticSlab(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const physId = body._physId;
        if (Math.abs(body.x - slab.x[physId]) > SLAB_POSE_EPS) return false;
        if (Math.abs(body.y - slab.y[physId]) > SLAB_POSE_EPS) return false;
        if (Math.abs((body.vx ?? 0) - slab.vx[physId]) > SLAB_VEL_EPS) return false;
        if (Math.abs((body.vy ?? 0) - slab.vy[physId]) > SLAB_VEL_EPS) return false;
        if (Math.abs((body.angularVelocity ?? 0) - slab.w[physId]) > SLAB_VEL_EPS) return false;
    }
    return true;
}
function readSlabIntoBounds(physId, out) {
    const slab = kineticDynamicSlab;
    out.cx = slab.x[physId];
    out.cy = slab.y[physId];
    if (slab.bpKind[physId] === BP_KIND_CIRCLE) {
        out.kind = BROADPHASE_KIND.Circle;
        out.r = slab.r[physId];
        return out;
    }
    out.kind = BROADPHASE_KIND.Obb;
    out.hx = slab.hx[physId];
    out.hy = slab.hy[physId];
    out.cos = slab.cos[physId];
    out.sin = slab.sin[physId];
    return out;
}
export function pairCircleCircleOverlapSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    const dx = slab.x[physIdA] - slab.x[physIdB];
    const dy = slab.y[physIdA] - slab.y[physIdB];
    const radii = slab.r[physIdA] + slab.r[physIdB];
    return dx * dx + dy * dy < radii * radii;
}
export function pairBroadphaseOverlapSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
    if (slab.bpKind[physIdA] === BP_KIND_CIRCLE && slab.bpKind[physIdB] === BP_KIND_CIRCLE) return pairCircleCircleOverlapSlab(physIdA, physIdB);
    readSlabIntoBounds(physIdA, SLAB_SCRATCH_A);
    readSlabIntoBounds(physIdB, SLAB_SCRATCH_B);
    return pairBroadphaseBoundsOverlap(SLAB_SCRATCH_A, SLAB_SCRATCH_B);
}
