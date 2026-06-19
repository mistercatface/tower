import { createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "../../Motion/bodyMass.js";
export const BP_KIND_CIRCLE = 0;
export const BP_KIND_OBB = 1;
const MAX_PHYS_BODIES = 4096;
export const kineticBodySlab = {
    x: new Float32Array(MAX_PHYS_BODIES),
    y: new Float32Array(MAX_PHYS_BODIES),
    vx: new Float32Array(MAX_PHYS_BODIES),
    vy: new Float32Array(MAX_PHYS_BODIES),
    w: new Float32Array(MAX_PHYS_BODIES),
    mass: new Float32Array(MAX_PHYS_BODIES),
    invMass: new Float32Array(MAX_PHYS_BODIES),
    invI: new Float32Array(MAX_PHYS_BODIES),
    pinned: new Uint8Array(MAX_PHYS_BODIES),
    bpKind: new Uint8Array(MAX_PHYS_BODIES),
    r: new Float32Array(MAX_PHYS_BODIES),
    hx: new Float32Array(MAX_PHYS_BODIES),
    hy: new Float32Array(MAX_PHYS_BODIES),
    cos: new Float32Array(MAX_PHYS_BODIES),
    sin: new Float32Array(MAX_PHYS_BODIES),
};
const SLAB_SCRATCH_A = createBroadphaseBounds();
const SLAB_SCRATCH_B = createBroadphaseBounds();
export function writeBroadphaseFromBounds(physId, bounds) {
    const slab = kineticBodySlab;
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
export function writeKinematicBodySlabSlot(body) {
    const physId = body._physId;
    const slab = kineticBodySlab;
    slab.x[physId] = body.x;
    slab.y[physId] = body.y;
    slab.vx[physId] = body.vx ?? 0;
    slab.vy[physId] = body.vy ?? 0;
    slab.w[physId] = body.angularVelocity ?? 0;
    slab.mass[physId] = massFromBody(body);
    slab.invMass[physId] = inverseMassFromBody(body);
    const moment = body.momentOfInertia;
    slab.invI[physId] = moment ? 1 / moment : 0;
    slab.pinned[physId] = bodyPinnedForContact(body) ? 1 : 0;
}
function invalidateBodyBroadphase(body) {
    if (body.broadphaseSnapshot) body.broadphaseSnapshot.x = NaN;
}
export function writebackKineticBodySlabPhysId(spatialFrame, physId) {
    const slab = kineticBodySlab;
    const body = spatialFrame.entityGrid.entities[physId];
    body.x = slab.x[physId];
    body.y = slab.y[physId];
    body.vx = slab.vx[physId];
    body.vy = slab.vy[physId];
    body.angularVelocity = slab.w[physId];
    invalidateBodyBroadphase(body);
}
export function writebackKineticBodySlabPhysIds(spatialFrame, physIds) {
    for (let i = 0; i < physIds.length; i++) writebackKineticBodySlabPhysId(spatialFrame, physIds[i]);
}
function readSlabIntoBounds(physId, out) {
    const slab = kineticBodySlab;
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
    const slab = kineticBodySlab;
    const dx = slab.x[physIdA] - slab.x[physIdB];
    const dy = slab.y[physIdA] - slab.y[physIdB];
    const radii = slab.r[physIdA] + slab.r[physIdB];
    return dx * dx + dy * dy < radii * radii;
}
export function pairBroadphaseOverlapSlab(physIdA, physIdB) {
    const slab = kineticBodySlab;
    if (slab.bpKind[physIdA] === BP_KIND_CIRCLE && slab.bpKind[physIdB] === BP_KIND_CIRCLE) return pairCircleCircleOverlapSlab(physIdA, physIdB);
    readSlabIntoBounds(physIdA, SLAB_SCRATCH_A);
    readSlabIntoBounds(physIdB, SLAB_SCRATCH_B);
    return pairBroadphaseBoundsOverlap(SLAB_SCRATCH_A, SLAB_SCRATCH_B);
}
