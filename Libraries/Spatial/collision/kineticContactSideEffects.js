import { tryFractureKineticContact } from "../../Props/propFracture.js";
import { resolveSnakeCombatFromContacts } from "../../Game/snake/snakeCombat.js";
import { resolveKineticContactPass, kineticContactBuffer } from "./kineticContactSolver.js";
import { kineticPairBodiesAt } from "./kineticPairStream.js";
import { kineticBodySlab } from "./kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
export function applyKineticContactSideEffects(world, spatialFrame, contacts, { snakeGame, state } = {}) {
    if (contacts.count === 0) return;
    const slab = kineticBodySlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const pair = kineticPairBodiesAt(spatialFrame, physIdA, physIdB);
        if (!pair) continue;
        const { bodyA, bodyB } = pair;
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        let hitX;
        let hitY;
        if (contacts.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            hitX = bodyA.x - nx * slab.r[physIdA];
            hitY = bodyA.y - ny * slab.r[physIdA];
        } else {
            hitX = bodyA.x + contacts.rax[i];
            hitY = bodyA.y + contacts.ray[i];
        }
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        tryFractureKineticContact(world, bodyA, bodyB, hitX, hitY, relSpeed, spatialFrame);
    }
    if (snakeGame && state) resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame);
}
export function resolveKineticContactPassWithEffects(world, spatialFrame, gameContext = {}) {
    resolveKineticContactPass(spatialFrame, world.kinetic);
    applyKineticContactSideEffects(world, spatialFrame, kineticContactBuffer, gameContext);
}
