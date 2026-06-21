import { tryFractureKineticContact } from "../../Props/propFracture.js";
import { kineticPairBodiesAt } from "./kineticPairStream.js";
import { kineticBodySlab } from "./kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
export function applyKineticContactSideEffects(tick, contacts) {
    if (contacts.count === 0) return;
    const slab = kineticBodySlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const pair = kineticPairBodiesAt(tick.frame, physIdA, physIdB);
        if (!pair) continue;
        const { bodyA, bodyB } = pair;
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        let hitX;
        let hitY;
        if (contacts.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            hitX = slab.x[physIdA] - nx * slab.r[physIdA];
            hitY = slab.y[physIdA] - ny * slab.r[physIdA];
        } else {
            hitX = slab.x[physIdA] + contacts.rax[i];
            hitY = slab.y[physIdA] + contacts.ray[i];
        }
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relSpeed);
    }
}
