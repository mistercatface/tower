import { createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "../../Motion/bodyMass.js";
export const BP_KIND_CIRCLE = 0;
export const BP_KIND_OBB = 1;
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../../Core/engineLimits.js";
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
};
kineticDynamicSlab.activeSlot.fill(-1);
kineticDynamicSlab.islandRoot.fill(-1);
const SLAB_SCRATCH_A = createBroadphaseBounds();
const SLAB_SCRATCH_B = createBroadphaseBounds();
export function writeBroadphaseFromBounds(physId, bounds) {
    const slab = kineticDynamicSlab;
    if (bounds.kind === "circle") {
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
        out.kind = "circle";
        out.r = slab.r[physId];
        return out;
    }
    out.kind = "obb";
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
