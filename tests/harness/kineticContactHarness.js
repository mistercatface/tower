import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, satCheckPartRowsAtPose } from "../../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../../Core/engineMemory.js";

export function checkPairAtSlabPose(bodyA, bodyB) {
    const slab = kineticDynamicSlab;
    const physIdA = bodyA._physId;
    const physIdB = bodyB._physId;
    const geomA = slab.partGeomOffset[physIdA];
    const geomB = slab.partGeomOffset[physIdB];
    if (geomA < 0 || geomB < 0) throw new Error(`checkPairAtSlabPose: missing shape CSR for physId ${geomA < 0 ? physIdA : physIdB}`);
    const xA = slab.x[physIdA];
    const yA = slab.y[physIdA];
    const xB = slab.x[physIdB];
    const yB = slab.y[physIdB];
    const cosA = slab.cos[physIdA];
    const sinA = slab.sin[physIdA];
    const cosB = slab.cos[physIdB];
    const sinB = slab.sin[physIdB];
    const countA = slab.partCount[physIdA];
    const countB = slab.partCount[physIdB];
    for (let i = 0; i < countA; i++) for (let j = 0; j < countB; j++) if (satCheckPartRowsAtPose(geomA + i, geomB + j, xA, yA, cosA, sinA, xB, yB, cosB, sinB)) return true;
    return false;
}

export function resolveKineticContactPass(tick) {
    const pairs = gatherKineticContactPairs(tick);
    return resolveKineticContactPassWithPairs(tick, pairs);
}

export function resolveKineticContactPassWithEffects(tick) {
    const contacts = resolveKineticContactPass(tick);
    tick.world.fractureEngine.processKineticContactFractures(tick, contacts);
}
