import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { bodyPinnedForContact, massFromBody } from "../../Motion/bodyMass.js";
import { gatherKineticCandidatePairs, kineticPairBodiesAt, kineticPairBodyAt, kineticPairBuffer, refreshKineticPairRelativeVelocities } from "./kineticPairStream.js";
import { stampKineticPairGatherTopology } from "../../Motion/kineticTopology.js";
import { snapshotActiveBroadphaseBounds } from "./entityBroadphase.js";
import { kineticBodySlab, writebackKineticBodySlabPhysIds } from "./kineticBodySlab.js";
import { separateAlongNormal, separateCoincidentCirclePair, COINCIDENT_CIRCLE_EPS } from "./penetration.js";
import { checkEntityPairCollision } from "./SatCollision.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { contactWarmStartKey, isRestingKineticContact, warmStartCacheIndex } from "./kineticContactManifold.js";
const MAX_CONTACTS = 4096;
const INNER_SOLVE_ITERATIONS = 4;
const WARM_START_CACHE_SIZE = 16384;
const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1;
const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
export const kineticContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CONTACTS),
    physIdB: new Int32Array(MAX_CONTACTS),
    tier: new Uint8Array(MAX_CONTACTS),
    nx: new Float32Array(MAX_CONTACTS),
    ny: new Float32Array(MAX_CONTACTS),
    rax: new Float32Array(MAX_CONTACTS),
    ray: new Float32Array(MAX_CONTACTS),
    rbx: new Float32Array(MAX_CONTACTS),
    rby: new Float32Array(MAX_CONTACTS),
    preDvx: new Float32Array(MAX_CONTACTS),
    preDvy: new Float32Array(MAX_CONTACTS),
    preSpeedA: new Float32Array(MAX_CONTACTS),
    preSpeedB: new Float32Array(MAX_CONTACTS),
    invMassA: new Float32Array(MAX_CONTACTS),
    invMassB: new Float32Array(MAX_CONTACTS),
    invIA: new Float32Array(MAX_CONTACTS),
    invIB: new Float32Array(MAX_CONTACTS),
    kNormal: new Float32Array(MAX_CONTACTS),
    kTangent: new Float32Array(MAX_CONTACTS),
    rAn: new Float32Array(MAX_CONTACTS),
    rBn: new Float32Array(MAX_CONTACTS),
    rAt: new Float32Array(MAX_CONTACTS),
    rBt: new Float32Array(MAX_CONTACTS),
    jn: new Float32Array(MAX_CONTACTS),
    jt: new Float32Array(MAX_CONTACTS),
    restitution: new Float32Array(MAX_CONTACTS),
    friction: new Float32Array(MAX_CONTACTS),
    featureA: new Uint8Array(MAX_CONTACTS),
    featureB: new Uint8Array(MAX_CONTACTS),
    warmStartKey: new Float64Array(MAX_CONTACTS),
    resting: new Uint8Array(MAX_CONTACTS),
    reset() {
        this.count = 0;
    },
};
export function circleCircleContactSlab(physIdA, physIdB) {
    const slab = kineticBodySlab;
    const dx = slab.x[physIdB] - slab.x[physIdA];
    const dy = slab.y[physIdB] - slab.y[physIdA];
    const distSq = dx * dx + dy * dy;
    const radii = slab.r[physIdA] + slab.r[physIdB];
    if (distSq >= radii * radii) return null;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) return { overlap: radii, nx: 0, ny: 0, coincident: true };
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return { overlap, nx, ny, coincident: false };
}
function separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap) {
    const slab = kineticBodySlab;
    const pinnedA = slab.pinned[physIdA];
    const pinnedB = slab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        slab.x[physIdB] += nx * overlap;
        slab.y[physIdB] += ny * overlap;
        return;
    }
    if (pinnedB) {
        slab.x[physIdA] -= nx * overlap;
        slab.y[physIdA] -= ny * overlap;
        return;
    }
    const massA = slab.mass[physIdA];
    const massB = slab.mass[physIdB];
    const totalMass = massA + massB;
    slab.x[physIdA] -= nx * overlap * (massB / totalMass);
    slab.y[physIdA] -= ny * overlap * (massB / totalMass);
    slab.x[physIdB] += nx * overlap * (massA / totalMass);
    slab.y[physIdB] += ny * overlap * (massA / totalMass);
}
function separateCoincidentCircleSlab(physIdA, physIdB, overlap) {
    const slab = kineticBodySlab;
    const pinnedA = slab.pinned[physIdA];
    const pinnedB = slab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        slab.x[physIdB] += overlap;
        return;
    }
    if (pinnedB) {
        slab.x[physIdA] -= overlap;
        return;
    }
    const massA = slab.mass[physIdA];
    const massB = slab.mass[physIdB];
    const totalMass = massA + massB;
    slab.x[physIdA] -= overlap * (massB / totalMass);
    slab.x[physIdB] += overlap * (massA / totalMass);
}
function syncBodyPoseToSlab(physIdA, physIdB, bodyA, bodyB) {
    const slab = kineticBodySlab;
    slab.x[physIdA] = bodyA.x;
    slab.y[physIdA] = bodyA.y;
    slab.x[physIdB] = bodyB.x;
    slab.y[physIdB] = bodyB.y;
}
function pairMaterialFriction(body) {
    const pair = body.strategy?.pairFriction;
    if (pair != null) return pair;
    return body.strategy?.wallPhysics?.friction ?? null;
}
function kineticPairRestitution(bodyA, bodyB) {
    const r1 = bodyA.strategy?.pairRestitution;
    const r2 = bodyB.strategy?.pairRestitution;
    if (r1 != null && r2 != null) return (r1 + r2) * 0.5;
    return r1 ?? r2 ?? getCollisionSettings().restitution.kineticPair;
}
function kineticPairFriction(bodyA, bodyB) {
    const f1 = pairMaterialFriction(bodyA);
    const f2 = pairMaterialFriction(bodyB);
    if (f1 != null && f2 != null) return Math.sqrt(f1 * f2);
    return f1 ?? f2 ?? getCollisionSettings().pairFriction;
}
function warmStartCacheLookup(key) {
    let idx = warmStartCacheIndex(key);
    while (true) {
        const slot = warmStartKeys[idx];
        if (slot === key) return idx;
        if (slot === 0) return -1;
        idx = (idx + 1) & WARM_START_CACHE_MASK;
    }
}
function applyCachedContactImpulse(contacts, i) {
    const slab = kineticBodySlab;
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    const tx = -ny;
    const ty = nx;
    const jn = contacts.jn[i];
    const jt = contacts.jt[i];
    const invMassA = contacts.invMassA[i];
    const invMassB = contacts.invMassB[i];
    slab.vx[physIdA] -= jn * nx * invMassA - jt * tx * invMassA;
    slab.vy[physIdA] -= jn * ny * invMassA - jt * ty * invMassA;
    slab.vx[physIdB] += jn * nx * invMassB - jt * tx * invMassB;
    slab.vy[physIdB] += jn * ny * invMassB - jt * ty * invMassB;
    slab.w[physIdA] -= jn * contacts.rAn[i] * contacts.invIA[i] - jt * contacts.rAt[i] * contacts.invIA[i];
    slab.w[physIdB] += jn * contacts.rBn[i] * contacts.invIB[i] - jt * contacts.rBt[i] * contacts.invIB[i];
}
function warmStartKineticContacts(contacts) {
    const settings = getCollisionSettings();
    const decay = settings.kineticWarmStartDecay;
    let restingCount = 0;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.warmStartKey[i];
        const cacheIdx = warmStartCacheLookup(key);
        if (cacheIdx === -1) {
            contacts.jn[i] = 0;
            contacts.jt[i] = 0;
        } else {
            contacts.jn[i] = warmStartJn[cacheIdx] * decay;
            contacts.jt[i] = warmStartJt[cacheIdx] * decay;
            applyCachedContactImpulse(contacts, i);
        }
        contacts.resting[i] = isRestingKineticContact(contacts, i, settings) ? 1 : 0;
        if (contacts.resting[i]) restingCount++;
    }
    return restingCount;
}
function storeKineticWarmStartCache(contacts) {
    warmStartKeys.fill(0);
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.warmStartKey[i];
        let idx = warmStartCacheIndex(key);
        while (true) {
            const slot = warmStartKeys[idx];
            if (slot === key || slot === 0) {
                warmStartKeys[idx] = key;
                warmStartJn[idx] = contacts.jn[i];
                warmStartJt[idx] = contacts.jt[i];
                break;
            }
            idx = (idx + 1) & WARM_START_CACHE_MASK;
        }
    }
}
function appendContact(contacts, physIdA, physIdB, tier, nx, ny, preDvx, preDvy, rax, ray, rbx, rby, featureA = 0, featureB = 0) {
    if (contacts.count >= MAX_CONTACTS) return;
    const i = contacts.count++;
    const slab = kineticBodySlab;
    contacts.physIdA[i] = physIdA;
    contacts.physIdB[i] = physIdB;
    contacts.tier[i] = tier;
    contacts.nx[i] = nx;
    contacts.ny[i] = ny;
    contacts.rax[i] = rax;
    contacts.ray[i] = ray;
    contacts.rbx[i] = rbx;
    contacts.rby[i] = rby;
    contacts.featureA[i] = featureA;
    contacts.featureB[i] = featureB;
    contacts.preDvx[i] = preDvx;
    contacts.preDvy[i] = preDvy;
    contacts.preSpeedA[i] = Math.hypot(slab.vx[physIdA], slab.vy[physIdA]);
    contacts.preSpeedB[i] = Math.hypot(slab.vx[physIdB], slab.vy[physIdB]);
}
function narrowPhaseCircleContact(physIdA, physIdB, preDvx, preDvy, contacts) {
    const info = circleCircleContactSlab(physIdA, physIdB);
    if (!info) return;
    if (info.coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, info.overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, info.nx, info.ny, info.overlap);
    appendContact(contacts, physIdA, physIdB, KINETIC_PAIR_TIER.CIRCLE_CIRCLE, info.nx, info.ny, preDvx, preDvy, 0, 0, 0, 0);
}
function narrowPhaseSatContact(spatialFrame, physIdA, physIdB, tier, preDvx, preDvy, contacts) {
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    const hit = checkEntityPairCollision(bodyA, bodyB);
    if (!hit) return;
    const massA = massFromBody(bodyA);
    const massB = massFromBody(bodyB);
    const pinnedA = bodyPinnedForContact(bodyA);
    const pinnedB = bodyPinnedForContact(bodyB);
    const info = hit.info;
    if (info.coincident) {
        separateCoincidentCirclePair(bodyA, bodyB, info.overlap, massA, massB, pinnedA, pinnedB);
        syncBodyPoseToSlab(physIdA, physIdB, bodyA, bodyB);
        return;
    }
    separateAlongNormal(bodyA, bodyB, info.nx, info.ny, info.overlap, massA, massB, pinnedA, pinnedB);
    syncBodyPoseToSlab(physIdA, physIdB, bodyA, bodyB);
    const points = info.points ?? [{ cx: info.cx, cy: info.cy, featureA: info.featureA ?? 0, featureB: info.featureB ?? 0 }];
    for (let p = 0; p < points.length; p++) {
        const pt = points[p];
        appendContact(contacts, physIdA, physIdB, tier, info.nx, info.ny, preDvx, preDvy, pt.cx - bodyA.x, pt.cy - bodyA.y, pt.cx - bodyB.x, pt.cy - bodyB.y, pt.featureA ?? 0, pt.featureB ?? 0);
    }
}
function narrowPhaseKineticContacts(spatialFrame, pairs, contacts) {
    contacts.reset();
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        if (!kineticPairBodiesAt(spatialFrame, physIdA, physIdB)) continue;
        const tier = pairs.tier[i];
        if (tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) narrowPhaseCircleContact(physIdA, physIdB, pairs.preDvx[i], pairs.preDvy[i], contacts);
        else narrowPhaseSatContact(spatialFrame, physIdA, physIdB, tier, pairs.preDvx[i], pairs.preDvy[i], contacts);
    }
}
function precomputeKineticContacts(spatialFrame, contacts) {
    const slab = kineticBodySlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        let rax = contacts.rax[i];
        let ray = contacts.ray[i];
        let rbx = contacts.rbx[i];
        let rby = contacts.rby[i];
        if (contacts.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            const rA = slab.r[physIdA];
            const rB = slab.r[physIdB];
            rax = -nx * rA;
            ray = -ny * rA;
            rbx = nx * rB;
            rby = ny * rB;
        }
        const invMassA = slab.invMass[physIdA];
        const invMassB = slab.invMass[physIdB];
        const invIA = slab.invI[physIdA];
        const invIB = slab.invI[physIdB];
        const rAn = rax * ny - ray * nx;
        const rBn = rbx * ny - rby * nx;
        const rAt = rax * nx + ray * ny;
        const rBt = rbx * nx + rby * ny;
        contacts.invMassA[i] = invMassA;
        contacts.invMassB[i] = invMassB;
        contacts.invIA[i] = invIA;
        contacts.invIB[i] = invIB;
        contacts.rAn[i] = rAn;
        contacts.rBn[i] = rBn;
        contacts.rAt[i] = rAt;
        contacts.rBt[i] = rBt;
        contacts.kNormal[i] = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        contacts.kTangent[i] = invMassA + invMassB + rAt * rAt * invIA + rBt * rBt * invIB;
        const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
        const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
        if (!bodyA || !bodyB) continue;
        contacts.restitution[i] = kineticPairRestitution(bodyA, bodyB);
        contacts.friction[i] = kineticPairFriction(bodyA, bodyB);
        contacts.warmStartKey[i] = contactWarmStartKey(bodyA, bodyB, contacts.featureA[i], contacts.featureB[i]);
    }
}
function applyContactImpulse(contacts, i, slab, iterMaxImpulse) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    const rax = contacts.rax[i];
    const ray = contacts.ray[i];
    const rbx = contacts.rbx[i];
    const rby = contacts.rby[i];
    const wA = slab.w[physIdA];
    const wB = slab.w[physIdB];
    const vAx = slab.vx[physIdA] - wA * ray;
    const vAy = slab.vy[physIdA] + wA * rax;
    const vBx = slab.vx[physIdB] - wB * rby;
    const vBy = slab.vy[physIdB] + wB * rbx;
    const velAlongNormal = (vBx - vAx) * nx + (vBy - vAy) * ny;
    let j = (-(1 + contacts.restitution[i]) * velAlongNormal) / contacts.kNormal[i];
    const oldJn = contacts.jn[i];
    contacts.jn[i] = Math.max(oldJn + j, 0);
    j = contacts.jn[i] - oldJn;
    const invMassA = contacts.invMassA[i];
    const invMassB = contacts.invMassB[i];
    let maxImpulse = iterMaxImpulse;
    if (j !== 0) {
        maxImpulse = Math.max(maxImpulse, Math.abs(j));
        slab.vx[physIdA] -= j * nx * invMassA;
        slab.vy[physIdA] -= j * ny * invMassA;
        slab.vx[physIdB] += j * nx * invMassB;
        slab.vy[physIdB] += j * ny * invMassB;
        slab.w[physIdA] -= j * contacts.rAn[i] * contacts.invIA[i];
        slab.w[physIdB] += j * contacts.rBn[i] * contacts.invIB[i];
    }
    const tx = -ny;
    const ty = nx;
    const wAn = slab.w[physIdA];
    const wBn = slab.w[physIdB];
    const vAxT = slab.vx[physIdA] - wAn * ray;
    const vAyT = slab.vy[physIdA] + wAn * rax;
    const vBxT = slab.vx[physIdB] - wBn * rby;
    const vByT = slab.vy[physIdB] + wBn * rbx;
    const vt = (vAxT - vBxT) * tx + (vAyT - vByT) * ty;
    let jt = -vt / contacts.kTangent[i];
    const maxFriction = contacts.jn[i] * contacts.friction[i];
    const oldJt = contacts.jt[i];
    contacts.jt[i] = Math.max(-maxFriction, Math.min(maxFriction, oldJt + jt));
    jt = contacts.jt[i] - oldJt;
    if (jt === 0) return maxImpulse;
    maxImpulse = Math.max(maxImpulse, Math.abs(jt));
    slab.vx[physIdA] += jt * tx * invMassA;
    slab.vy[physIdA] += jt * ty * invMassA;
    slab.vx[physIdB] -= jt * tx * invMassB;
    slab.vy[physIdB] -= jt * ty * invMassB;
    slab.w[physIdA] += jt * contacts.rAt[i] * contacts.invIA[i];
    slab.w[physIdB] -= jt * contacts.rBt[i] * contacts.invIB[i];
    return maxImpulse;
}
function solveKineticContactVelocities(contacts, iterations, restingCount) {
    const slab = kineticBodySlab;
    const count = contacts.count;
    const { contactImpulseEpsilon } = getCollisionSettings().kineticEarlyOut;
    let iterationsRun = 0;
    let solveMaxImpulse = 0;
    for (let iter = 0; iter < iterations; iter++) {
        iterationsRun = iter + 1;
        let maxImpulse = 0;
        for (let i = 0; i < count; i++) {
            if (contacts.resting[i] && iter > 0) continue;
            maxImpulse = applyContactImpulse(contacts, i, slab, maxImpulse);
        }
        solveMaxImpulse = Math.max(solveMaxImpulse, maxImpulse);
        if (maxImpulse <= contactImpulseEpsilon) break;
        if (restingCount === count && count > 0) break;
    }
    return { innerIterations: iterationsRun, maxImpulse: solveMaxImpulse, restingCount };
}
function collectContactPhysIds(contacts) {
    const touched = new Set();
    for (let i = 0; i < contacts.count; i++) {
        touched.add(contacts.physIdA[i]);
        touched.add(contacts.physIdB[i]);
    }
    return [...touched];
}
function applyKineticContactWake(contacts, spatialFrame) {
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        invalidateWallResolveCache(pair.bodyA, pair.bodyB);
        spatialFrame.scheduleKineticActivation(pair.bodyA);
        spatialFrame.scheduleKineticActivation(pair.bodyB);
    }
}
export function gatherKineticContactPairs(tick) {
    snapshotActiveBroadphaseBounds(tick.frame._activeKineticBodies);
    stampKineticPairGatherTopology(tick.frame, tick.world.kinetic);
    const pairs = kineticPairBuffer;
    gatherKineticCandidatePairs(tick.frame, pairs);
    return pairs;
}
export function resolveKineticContactPassWithPairs(tick, pairs) {
    const frame = tick.frame;
    refreshKineticPairRelativeVelocities(pairs);
    const contacts = kineticContactBuffer;
    narrowPhaseKineticContacts(frame, pairs, contacts);
    if (contacts.count === 0) return;
    precomputeKineticContacts(frame, contacts);
    const restingCount = warmStartKineticContacts(contacts);
    tick.world.kinetic.kineticContactStats = solveKineticContactVelocities(contacts, INNER_SOLVE_ITERATIONS, restingCount);
    storeKineticWarmStartCache(contacts);
    writebackKineticBodySlabPhysIds(frame, collectContactPhysIds(contacts));
    applyKineticContactWake(contacts, frame);
}
