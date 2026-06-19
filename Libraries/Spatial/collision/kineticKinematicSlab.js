import { invalidateBroadphaseBounds } from "./entityBroadphase.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "../../Motion/bodyMass.js";
const MAX_PHYS_BODIES = 4096;
export const kineticKinematicSlab = {
    x: new Float32Array(MAX_PHYS_BODIES),
    y: new Float32Array(MAX_PHYS_BODIES),
    vx: new Float32Array(MAX_PHYS_BODIES),
    vy: new Float32Array(MAX_PHYS_BODIES),
    w: new Float32Array(MAX_PHYS_BODIES),
    mass: new Float32Array(MAX_PHYS_BODIES),
    invMass: new Float32Array(MAX_PHYS_BODIES),
    invI: new Float32Array(MAX_PHYS_BODIES),
    pinned: new Uint8Array(MAX_PHYS_BODIES),
};
export function snapshotKinematicSlab(bodies) {
    const kin = kineticKinematicSlab;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const physId = body._physId;
        kin.x[physId] = body.x;
        kin.y[physId] = body.y;
        kin.vx[physId] = body.vx ?? 0;
        kin.vy[physId] = body.vy ?? 0;
        kin.w[physId] = body.angularVelocity ?? 0;
        kin.mass[physId] = massFromBody(body);
        kin.invMass[physId] = inverseMassFromBody(body);
        const moment = body.momentOfInertia;
        kin.invI[physId] = moment ? 1 / moment : 0;
        kin.pinned[physId] = bodyPinnedForContact(body) ? 1 : 0;
    }
}
export function writebackKinematicSlabPhysId(spatialFrame, physId) {
    const kin = kineticKinematicSlab;
    const body = spatialFrame.entityGrid.entities[physId];
    body.x = kin.x[physId];
    body.y = kin.y[physId];
    body.vx = kin.vx[physId];
    body.vy = kin.vy[physId];
    body.angularVelocity = kin.w[physId];
    invalidateBroadphaseBounds(body);
}
export function writebackKinematicSlabPhysIds(spatialFrame, physIds) {
    for (let i = 0; i < physIds.length; i++) writebackKinematicSlabPhysId(spatialFrame, physIds[i]);
}
