import { createBroadphaseBounds, pairBroadphaseBoundsOverlap } from "./Broadphase.js";
export const BP_KIND_CIRCLE = 0;
export const BP_KIND_OBB = 1;
const MAX_PHYS_BODIES = 4096;
export const kineticBroadphaseSlab = {
    kind: new Uint8Array(MAX_PHYS_BODIES),
    cx: new Float32Array(MAX_PHYS_BODIES),
    cy: new Float32Array(MAX_PHYS_BODIES),
    r: new Float32Array(MAX_PHYS_BODIES),
    hx: new Float32Array(MAX_PHYS_BODIES),
    hy: new Float32Array(MAX_PHYS_BODIES),
    cos: new Float32Array(MAX_PHYS_BODIES),
    sin: new Float32Array(MAX_PHYS_BODIES),
};
const SLAB_SCRATCH_A = createBroadphaseBounds();
const SLAB_SCRATCH_B = createBroadphaseBounds();
export function writeKineticBroadphaseSlabSlot(physId, bounds) {
    const slab = kineticBroadphaseSlab;
    slab.cx[physId] = bounds.cx;
    slab.cy[physId] = bounds.cy;
    if (bounds.kind === "circle") {
        slab.kind[physId] = BP_KIND_CIRCLE;
        slab.r[physId] = bounds.r;
        return;
    }
    slab.kind[physId] = BP_KIND_OBB;
    slab.hx[physId] = bounds.hx;
    slab.hy[physId] = bounds.hy;
    slab.cos[physId] = bounds.cos;
    slab.sin[physId] = bounds.sin;
}
function readSlabIntoBounds(physId, out) {
    const slab = kineticBroadphaseSlab;
    out.cx = slab.cx[physId];
    out.cy = slab.cy[physId];
    if (slab.kind[physId] === BP_KIND_CIRCLE) {
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
    const slab = kineticBroadphaseSlab;
    const dx = slab.cx[physIdA] - slab.cx[physIdB];
    const dy = slab.cy[physIdA] - slab.cy[physIdB];
    const radii = slab.r[physIdA] + slab.r[physIdB];
    return dx * dx + dy * dy < radii * radii;
}
export function pairBroadphaseOverlapSlab(physIdA, physIdB) {
    const slab = kineticBroadphaseSlab;
    if (slab.kind[physIdA] === BP_KIND_CIRCLE && slab.kind[physIdB] === BP_KIND_CIRCLE) return pairCircleCircleOverlapSlab(physIdA, physIdB);
    readSlabIntoBounds(physIdA, SLAB_SCRATCH_A);
    readSlabIntoBounds(physIdB, SLAB_SCRATCH_B);
    return pairBroadphaseBoundsOverlap(SLAB_SCRATCH_A, SLAB_SCRATCH_B);
}
