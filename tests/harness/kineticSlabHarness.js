import { kineticDynamicSlab } from "../../Core/engineMemory.js";

const SLAB_POSE_EPS = 1e-4;
const SLAB_VEL_EPS = 1e-4;

export function bodiesMatchKineticSlab(bodies) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const physId = body._physId;
        if (Math.abs(body.x - slab.x[physId]) > SLAB_POSE_EPS) return false;
        if (Math.abs(body.y - slab.y[physId]) > SLAB_POSE_EPS) return false;
        if (Math.abs(body.vx - slab.vx[physId]) > SLAB_VEL_EPS) return false;
        if (Math.abs(body.vy - slab.vy[physId]) > SLAB_VEL_EPS) return false;
        if (Math.abs(body.angularVelocity - slab.w[physId]) > SLAB_VEL_EPS) return false;
    }
    return true;
}

export function slabPose(body) {
    const physId = body._physId;
    const slab = kineticDynamicSlab;
    return { x: slab.x[physId], y: slab.y[physId], vx: slab.vx[physId], vy: slab.vy[physId], w: slab.w[physId] };
}

export function writeSlabPose(body, x, y, vx = body.vx, vy = body.vy, w = body.angularVelocity) {
    const physId = body._physId;
    const slab = kineticDynamicSlab;
    slab.x[physId] = x;
    slab.y[physId] = y;
    slab.vx[physId] = vx;
    slab.vy[physId] = vy;
    slab.w[physId] = w;
}
