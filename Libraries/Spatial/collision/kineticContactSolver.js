import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import {
    gatherKineticCandidatePairs,
    kineticPairBuffer,
    kineticPairBodiesAt,
    kineticPairBodyAt,
    refreshKineticPairRelativeVelocities,
    compactSubstepKineticPairs,
    patchKineticPairsForBodies,
    copyKineticPairBuffer,
    kineticContactBodiesAt,
} from "./kineticPairStream.js";
import { kineticPairTopologyStale } from "../../Motion/kineticTopology.js";
import { stampKineticPairGatherTopology } from "../../Motion/kineticTopology.js";
import { refreshActiveKineticBodySlabPose } from "./entityBroadphase.js";
import { kineticDynamicSlab, kineticStaticSlab, separateAlongNormalSlab, separateCoincidentCircleSlab } from "./kineticBodySlab.js";
import { COINCIDENT_CIRCLE_EPS } from "./penetration.js";
import { checkEntityPairCollisionAt } from "./SatCollision.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { contactWarmStartKeyFromPairKey, isRestingKineticContact, warmStartCacheIndex } from "./kineticContactManifold.js";
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
    dynamic: {
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
        rAn: new Float32Array(MAX_CONTACTS),
        rBn: new Float32Array(MAX_CONTACTS),
        rAt: new Float32Array(MAX_CONTACTS),
        rBt: new Float32Array(MAX_CONTACTS),
        jn: new Float32Array(MAX_CONTACTS),
        jt: new Float32Array(MAX_CONTACTS),
        resting: new Uint8Array(MAX_CONTACTS),
    },
    static: {
        tier: new Uint8Array(MAX_CONTACTS),
        invMassA: new Float32Array(MAX_CONTACTS),
        invMassB: new Float32Array(MAX_CONTACTS),
        invIA: new Float32Array(MAX_CONTACTS),
        invIB: new Float32Array(MAX_CONTACTS),
        kNormal: new Float32Array(MAX_CONTACTS),
        kTangent: new Float32Array(MAX_CONTACTS),
        restitution: new Float32Array(MAX_CONTACTS),
        friction: new Float32Array(MAX_CONTACTS),
        featureA: new Uint8Array(MAX_CONTACTS),
        featureB: new Uint8Array(MAX_CONTACTS),
        warmStartKey: new Float64Array(MAX_CONTACTS),
    },
    reset() {
        this.count = 0;
    },
};
export function circleCircleContactSlab(physIdA, physIdB) {
    const slab = kineticDynamicSlab;
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
    const slab = kineticDynamicSlab;
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const tx = -ny;
    const ty = nx;
    const jn = contacts.dynamic.jn[i];
    const jt = contacts.dynamic.jt[i];
    const invMassA = contacts.static.invMassA[i];
    const invMassB = contacts.static.invMassB[i];
    slab.vx[physIdA] -= jn * nx * invMassA - jt * tx * invMassA;
    slab.vy[physIdA] -= jn * ny * invMassA - jt * ty * invMassA;
    slab.vx[physIdB] += jn * nx * invMassB - jt * tx * invMassB;
    slab.vy[physIdB] += jn * ny * invMassB - jt * ty * invMassB;
    slab.w[physIdA] -= jn * contacts.dynamic.rAn[i] * contacts.static.invIA[i] - jt * contacts.dynamic.rAt[i] * contacts.static.invIA[i];
    slab.w[physIdB] += jn * contacts.dynamic.rBn[i] * contacts.static.invIB[i] - jt * contacts.dynamic.rBt[i] * contacts.static.invIB[i];
}
function warmStartKineticContacts(contacts) {
    const settings = getCollisionSettings();
    const decay = settings.kineticWarmStartDecay;
    let restingCount = 0;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        const cacheIdx = warmStartCacheLookup(key);
        if (cacheIdx === -1) {
            contacts.dynamic.jn[i] = 0;
            contacts.dynamic.jt[i] = 0;
        } else {
            contacts.dynamic.jn[i] = warmStartJn[cacheIdx] * decay;
            contacts.dynamic.jt[i] = warmStartJt[cacheIdx] * decay;
            applyCachedContactImpulse(contacts, i);
        }
        contacts.dynamic.resting[i] = isRestingKineticContact(contacts, i, settings) ? 1 : 0;
        if (contacts.dynamic.resting[i]) restingCount++;
    }
    return restingCount;
}
function storeKineticWarmStartCache(contacts) {
    warmStartKeys.fill(0);
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        let idx = warmStartCacheIndex(key);
        while (true) {
            const slot = warmStartKeys[idx];
            if (slot === key || slot === 0) {
                warmStartKeys[idx] = key;
                warmStartJn[idx] = contacts.dynamic.jn[i];
                warmStartJt[idx] = contacts.dynamic.jt[i];
                break;
            }
            idx = (idx + 1) & WARM_START_CACHE_MASK;
        }
    }
}
function appendContact(contacts, physIdA, physIdB, tier, nx, ny, preDvx, preDvy, rax, ray, rbx, rby, restitution, friction, warmStartPairKey, featureA = 0, featureB = 0) {
    if (contacts.count >= MAX_CONTACTS) return;
    const i = contacts.count++;
    const slab = kineticDynamicSlab;
    contacts.physIdA[i] = physIdA;
    contacts.physIdB[i] = physIdB;
    contacts.static.tier[i] = tier;
    contacts.dynamic.nx[i] = nx;
    contacts.dynamic.ny[i] = ny;
    contacts.dynamic.rax[i] = rax;
    contacts.dynamic.ray[i] = ray;
    contacts.dynamic.rbx[i] = rbx;
    contacts.dynamic.rby[i] = rby;
    contacts.static.featureA[i] = featureA;
    contacts.static.featureB[i] = featureB;
    contacts.dynamic.preDvx[i] = preDvx;
    contacts.dynamic.preDvy[i] = preDvy;
    contacts.dynamic.preSpeedA[i] = Math.hypot(slab.vx[physIdA], slab.vy[physIdA]);
    contacts.dynamic.preSpeedB[i] = Math.hypot(slab.vx[physIdB], slab.vy[physIdB]);
    contacts.static.restitution[i] = restitution;
    contacts.static.friction[i] = friction;
    contacts.static.warmStartKey[i] = contactWarmStartKeyFromPairKey(warmStartPairKey, featureA, featureB);
}
function narrowPhaseCircleContact(physIdA, physIdB, preDvx, preDvy, restitution, friction, warmStartPairKey, contacts) {
    const info = circleCircleContactSlab(physIdA, physIdB);
    if (!info) return;
    if (info.coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, info.overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, info.nx, info.ny, info.overlap);
    appendContact(contacts, physIdA, physIdB, KINETIC_PAIR_TIER.CIRCLE_CIRCLE, info.nx, info.ny, preDvx, preDvy, 0, 0, 0, 0, restitution, friction, warmStartPairKey);
}
function narrowPhaseSatContact(spatialFrame, physIdA, physIdB, tier, preDvx, preDvy, restitution, friction, warmStartPairKey, contacts) {
    const slab = kineticDynamicSlab;
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    const hit = checkEntityPairCollisionAt(bodyA, slab.x[physIdA], slab.y[physIdA], bodyB, slab.x[physIdB], slab.y[physIdB]);
    if (!hit) return;
    const info = hit.info;
    if (info.coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, info.overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, info.nx, info.ny, info.overlap);
    const points = info.points ?? [{ cx: info.cx, cy: info.cy, featureA: info.featureA ?? 0, featureB: info.featureB ?? 0 }];
    for (let p = 0; p < points.length; p++) {
        const pt = points[p];
        appendContact(
            contacts,
            physIdA,
            physIdB,
            tier,
            info.nx,
            info.ny,
            preDvx,
            preDvy,
            pt.cx - slab.x[physIdA],
            pt.cy - slab.y[physIdA],
            pt.cx - slab.x[physIdB],
            pt.cy - slab.y[physIdB],
            restitution,
            friction,
            warmStartPairKey,
            pt.featureA ?? 0,
            pt.featureB ?? 0,
        );
    }
}
function narrowPhaseKineticContacts(spatialFrame, pairs, contacts) {
    contacts.reset();
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        if (!kineticPairBodiesAt(spatialFrame, physIdA, physIdB)) continue;
        const tier = pairs.static.tier[i];
        if (tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE)
            narrowPhaseCircleContact(
                physIdA,
                physIdB,
                pairs.dynamic.preDvx[i],
                pairs.dynamic.preDvy[i],
                pairs.static.restitution[i],
                pairs.static.friction[i],
                pairs.static.warmStartPairKey[i],
                contacts,
            );
        else
            narrowPhaseSatContact(
                spatialFrame,
                physIdA,
                physIdB,
                tier,
                pairs.dynamic.preDvx[i],
                pairs.dynamic.preDvy[i],
                pairs.static.restitution[i],
                pairs.static.friction[i],
                pairs.static.warmStartPairKey[i],
                contacts,
            );
    }
}
function precomputeKineticContacts(spatialFrame, contacts) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const nx = contacts.dynamic.nx[i];
        const ny = contacts.dynamic.ny[i];
        let rax = contacts.dynamic.rax[i];
        let ray = contacts.dynamic.ray[i];
        let rbx = contacts.dynamic.rbx[i];
        let rby = contacts.dynamic.rby[i];
        if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
            const rA = dynSlab.r[physIdA];
            const rB = dynSlab.r[physIdB];
            rax = -nx * rA;
            ray = -ny * rA;
            rbx = nx * rB;
            rby = ny * rB;
        }
        const invMassA = statSlab.invMass[physIdA];
        const invMassB = statSlab.invMass[physIdB];
        const invIA = statSlab.invI[physIdA];
        const invIB = statSlab.invI[physIdB];
        const rAn = rax * ny - ray * nx;
        const rBn = rbx * ny - rby * nx;
        const rAt = rax * nx + ray * ny;
        const rBt = rbx * nx + rby * ny;
        contacts.static.invMassA[i] = invMassA;
        contacts.static.invMassB[i] = invMassB;
        contacts.static.invIA[i] = invIA;
        contacts.static.invIB[i] = invIB;
        contacts.dynamic.rAn[i] = rAn;
        contacts.dynamic.rBn[i] = rBn;
        contacts.dynamic.rAt[i] = rAt;
        contacts.dynamic.rBt[i] = rBt;
        contacts.static.kNormal[i] = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        contacts.static.kTangent[i] = invMassA + invMassB + rAt * rAt * invIA + rBt * rBt * invIB;
    }
}
function applyContactImpulse(contacts, i, slab, iterMaxImpulse) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const rax = contacts.dynamic.rax[i];
    const ray = contacts.dynamic.ray[i];
    const rbx = contacts.dynamic.rbx[i];
    const rby = contacts.dynamic.rby[i];
    const wA = slab.w[physIdA];
    const wB = slab.w[physIdB];
    const vAx = slab.vx[physIdA] - wA * ray;
    const vAy = slab.vy[physIdA] + wA * rax;
    const vBx = slab.vx[physIdB] - wB * rby;
    const vBy = slab.vy[physIdB] + wB * rbx;
    const velAlongNormal = (vBx - vAx) * nx + (vBy - vAy) * ny;
    let j = (-(1 + contacts.static.restitution[i]) * velAlongNormal) / contacts.static.kNormal[i];
    const oldJn = contacts.dynamic.jn[i];
    contacts.dynamic.jn[i] = Math.max(oldJn + j, 0);
    j = contacts.dynamic.jn[i] - oldJn;
    const invMassA = contacts.static.invMassA[i];
    const invMassB = contacts.static.invMassB[i];
    let maxImpulse = iterMaxImpulse;
    if (j !== 0) {
        maxImpulse = Math.max(maxImpulse, Math.abs(j));
        slab.vx[physIdA] -= j * nx * invMassA;
        slab.vy[physIdA] -= j * ny * invMassA;
        slab.vx[physIdB] += j * nx * invMassB;
        slab.vy[physIdB] += j * ny * invMassB;
        slab.w[physIdA] -= j * contacts.dynamic.rAn[i] * contacts.static.invIA[i];
        slab.w[physIdB] += j * contacts.dynamic.rBn[i] * contacts.static.invIB[i];
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
    let jt = -vt / contacts.static.kTangent[i];
    const maxFriction = contacts.dynamic.jn[i] * contacts.static.friction[i];
    const oldJt = contacts.dynamic.jt[i];
    contacts.dynamic.jt[i] = Math.max(-maxFriction, Math.min(maxFriction, oldJt + jt));
    jt = contacts.dynamic.jt[i] - oldJt;
    if (jt === 0) return maxImpulse;
    maxImpulse = Math.max(maxImpulse, Math.abs(jt));
    slab.vx[physIdA] += jt * tx * invMassA;
    slab.vy[physIdA] += jt * ty * invMassA;
    slab.vx[physIdB] -= jt * tx * invMassB;
    slab.vy[physIdB] -= jt * ty * invMassB;
    slab.w[physIdA] += jt * contacts.dynamic.rAt[i] * contacts.static.invIA[i];
    slab.w[physIdB] -= jt * contacts.dynamic.rBt[i] * contacts.static.invIB[i];
    return maxImpulse;
}
function solveKineticContactVelocities(contacts, iterations, restingCount) {
    const slab = kineticDynamicSlab;
    const count = contacts.count;
    const { contactImpulseEpsilon } = getCollisionSettings().kineticEarlyOut;
    let iterationsRun = 0;
    let solveMaxImpulse = 0;
    for (let iter = 0; iter < iterations; iter++) {
        iterationsRun = iter + 1;
        let maxImpulse = 0;
        for (let i = 0; i < count; i++) {
            if (contacts.dynamic.resting[i] && iter > 0) continue;
            maxImpulse = applyContactImpulse(contacts, i, slab, maxImpulse);
        }
        solveMaxImpulse = Math.max(solveMaxImpulse, maxImpulse);
        if (maxImpulse <= contactImpulseEpsilon) break;
        if (restingCount === count && count > 0) break;
    }
    return { innerIterations: iterationsRun, maxImpulse: solveMaxImpulse, restingCount };
}
function applyKineticContactWake(contacts, spatialFrame) {
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticContactBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        invalidateWallResolveCache(pair.bodyA, pair.bodyB);
        spatialFrame.scheduleKineticActivation(pair.bodyA);
        spatialFrame.scheduleKineticActivation(pair.bodyB);
    }
}
export function gatherKineticContactPairs(tick) {
    refreshActiveKineticBodySlabPose(tick.frame._activeKineticBodies);
    stampKineticPairGatherTopology(tick.frame, tick.world.kinetic);
    const pairs = kineticPairBuffer;
    gatherKineticCandidatePairs(tick.frame, pairs);
    return pairs;
}
function bumpPairGatherStat(session, field) {
    if (!session.kineticPairGatherStats) session.kineticPairGatherStats = { full: 0, refresh: 0, patch: 0 };
    session.kineticPairGatherStats[field]++;
}
export function ensureKineticContactPairs(tick, outPairs) {
    const session = tick.world.kinetic;
    const frame = tick.frame;
    if (!session.substepPairsValid || kineticPairTopologyStale(frame)) {
        gatherKineticContactPairs(tick);
        copyKineticPairBuffer(kineticPairBuffer, outPairs);
        session.substepPairsValid = true;
        bumpPairGatherStat(session, "full");
        return outPairs;
    }
    refreshActiveKineticBodySlabPose(frame._activeKineticBodies);
    stampKineticPairGatherTopology(frame, session);
    if (!compactSubstepKineticPairs(frame, outPairs)) {
        session.substepPairsValid = false;
        return ensureKineticContactPairs(tick, outPairs);
    }
    refreshKineticPairRelativeVelocities(outPairs);
    bumpPairGatherStat(session, "refresh");
    const patchBodies = session.substepPairPatchBodies;
    if (patchBodies?.length) {
        if (patchKineticPairsForBodies(frame, outPairs, patchBodies) > 0) bumpPairGatherStat(session, "patch");
        patchBodies.length = 0;
    }
    return outPairs;
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
    applyKineticContactWake(contacts, frame);
}
