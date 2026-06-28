import { queueFractureKineticContact, flushDeferredFractures } from "../../Props/propFracture.js";
import { kineticPairBodyAt } from "./kineticPairStream.js";
import { kineticDynamicSlab } from "./kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
export function applyKineticContactSideEffects(tick, contacts) {
    if (contacts.count === 0) return;
    const slab = kineticDynamicSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const bodyA = kineticPairBodyAt(tick.frame, physIdA);
        const bodyB = kineticPairBodyAt(tick.frame, physIdB);
        if (!bodyA || !bodyB) continue;
        const nx = contacts.dynamic.nx[i];
        const ny = contacts.dynamic.ny[i];
        let hitX;
        let hitY;
        if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            hitX = slab.x[physIdA] - nx * slab.r[physIdA];
            hitY = slab.y[physIdA] - ny * slab.r[physIdA];
        } else {
            hitX = slab.x[physIdA] + contacts.dynamic.rax[i];
            hitY = slab.y[physIdA] + contacts.dynamic.ray[i];
        }
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relSpeed);
    }
    flushDeferredFractures(tick.world, tick.frame);
}
