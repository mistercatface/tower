import { collisionSettings } from "./physicsDefaults.js";
import { invalidateWallResolveCache } from "./wallResolution.js";
import { kineticPairTopologyStale, stampKineticPairGatherTopology } from "./kineticConstraintSolver.js";
import { refreshActiveKineticBodySlabPose, allowsKineticCollisionPair, isKinematicallyActive, shouldResolveKineticPair, shouldResolveKineticPairSlab } from "./broadphase.js";
import { kineticDynamicSlab, kineticStaticSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab } from "./physicsSlabs.js";
import { COINCIDENT_CIRCLE_EPS, checkEntityPairCollisionAt, SAT_RESULT, SHAPE_TYPE_ID } from "./collisionMath.js";
import { MAX_ENTITIES as MAX_CONTACTS, MAX_ENTITIES as MAX_KINETIC_PAIRS, MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
import { shareKineticIsland, shareKineticIslandSlab } from "./kineticPhysicsPass.js";
// --- MERGED FROM kineticContactSolver.js ---
export const PAIR_KEY_SCALE = 1_000_000;
const WARM_START_FEATURE_STRIDE = 1024;
const FEATURE_ANGLE_BUCKETS = 32;
export function quantizeContactFeatureId(nx, ny) {
    if (nx === 0 && ny === 0) return 0;
    const angle = Math.atan2(ny, nx);
    let bucket = Math.round((angle / (Math.PI * 2)) * FEATURE_ANGLE_BUCKETS);
    if (bucket < 0) bucket += FEATURE_ANGLE_BUCKETS;
    if (bucket >= FEATURE_ANGLE_BUCKETS) bucket = 0;
    return bucket & 0x1f;
}
export function pairContactKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? bodyA.id * PAIR_KEY_SCALE + bodyB.id : bodyB.id * PAIR_KEY_SCALE + bodyA.id;
}
export function contactWarmStartKey(bodyA, bodyB, featureA = 0, featureB = 0) {
    const isAFirst = bodyA.id < bodyB.id;
    const f1 = isAFirst ? featureA : featureB;
    const f2 = isAFirst ? featureB : featureA;
    const featureKey = (f1 & 0x1f) | ((f2 & 0x1f) << 5);
    return pairContactKey(bodyA, bodyB) * WARM_START_FEATURE_STRIDE + featureKey;
}
export function contactWarmStartKeyFromPairKey(pairKey, featureA = 0, featureB = 0) {
    const featureKey = (featureA & 0x1f) | ((featureB & 0x1f) << 5);
    return pairKey * WARM_START_FEATURE_STRIDE + featureKey;
}
export function warmStartCacheIndex(warmStartKey) {
    return (Math.trunc(warmStartKey / PAIR_KEY_SCALE) ^ (warmStartKey % PAIR_KEY_SCALE)) & WARM_START_CACHE_MASK;
}
export function isRestingKineticContact(contacts, i, settings) {
    const resting = settings.kineticResting ?? {};
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const preN = contacts.dynamic.preDvx[i] * nx + contacts.dynamic.preDvy[i] * ny;
    const preT = contacts.dynamic.preDvx[i] * -ny + contacts.dynamic.preDvy[i] * nx;
    const normalEps = resting.normalVelocityEpsilon ?? 0.05;
    const tangentEps = resting.tangentVelocityEpsilon ?? 0.05;
    const velSlack = 1e-4;
    return Math.abs(preN) <= normalEps + velSlack && Math.abs(preT) <= tangentEps + velSlack;
}
const INNER_SOLVE_ITERATIONS = 4;
const WARM_START_CACHE_SIZE = 16384;
const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1;
const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
const warmStartGen = new Int32Array(WARM_START_CACHE_SIZE);
const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
let warmStartGeneration = 1;
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
    if (distSq >= radii * radii) return false;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) {
        SAT_RESULT[0] = radii;
        SAT_RESULT[1] = 0;
        SAT_RESULT[2] = 0;
        SAT_RESULT[5] = 1; // coincident
        return true;
    }
    const dist = Math.sqrt(distSq);
    SAT_RESULT[0] = radii - dist;
    SAT_RESULT[1] = dx / dist;
    SAT_RESULT[2] = dy / dist;
    SAT_RESULT[5] = 0; // coincident
    return true;
}
function warmStartCacheLookup(key) {
    let idx = warmStartCacheIndex(key);
    while (true) {
        if (warmStartGen[idx] !== warmStartGeneration) return -1;
        if (warmStartKeys[idx] === key) return idx;
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
    const settings = collisionSettings;
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
    warmStartGeneration++;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.static.warmStartKey[i];
        let idx = warmStartCacheIndex(key);
        while (true) {
            if (warmStartGen[idx] !== warmStartGeneration || warmStartKeys[idx] === key) {
                warmStartGen[idx] = warmStartGeneration;
                warmStartKeys[idx] = key;
                warmStartJn[idx] = contacts.dynamic.jn[i];
                warmStartJt[idx] = contacts.dynamic.jt[i];
                break;
            }
            idx = (idx + 1) & WARM_START_CACHE_MASK;
        }
    }
}
function appendContact(contacts, pairs, pairIndex, nx, ny, rax, ray, rbx, rby, featureA = 0, featureB = 0) {
    if (contacts.count >= MAX_CONTACTS) return;
    const i = contacts.count++;
    contacts.physIdA[i] = pairs.physIdA[pairIndex];
    contacts.physIdB[i] = pairs.physIdB[pairIndex];
    contacts.static.tier[i] = pairs.static.tier[pairIndex];
    contacts.dynamic.nx[i] = nx;
    contacts.dynamic.ny[i] = ny;
    contacts.dynamic.rax[i] = rax;
    contacts.dynamic.ray[i] = ray;
    contacts.dynamic.rbx[i] = rbx;
    contacts.dynamic.rby[i] = rby;
    contacts.static.featureA[i] = featureA;
    contacts.static.featureB[i] = featureB;
    const slab = kineticDynamicSlab;
    contacts.dynamic.preDvx[i] = slab.vx[contacts.physIdB[i]] - slab.vx[contacts.physIdA[i]];
    contacts.dynamic.preDvy[i] = slab.vy[contacts.physIdB[i]] - slab.vy[contacts.physIdA[i]];
    contacts.static.restitution[i] = pairs.static.restitution[pairIndex];
    contacts.static.friction[i] = pairs.static.friction[pairIndex];
    contacts.static.warmStartKey[i] = contactWarmStartKeyFromPairKey(pairs.static.warmStartPairKey[pairIndex], featureA, featureB);
}
function narrowPhaseCircleContact(pairs, pairIndex, contacts) {
    const physIdA = pairs.physIdA[pairIndex];
    const physIdB = pairs.physIdB[pairIndex];
    if (!circleCircleContactSlab(physIdA, physIdB)) return;
    const overlap = SAT_RESULT[0];
    const nx = SAT_RESULT[1];
    const ny = SAT_RESULT[2];
    const coincident = SAT_RESULT[5] !== 0;
    if (coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap);
    const slab = kineticDynamicSlab;
    const rA = slab.r[physIdA];
    const rB = slab.r[physIdB];
    appendContact(contacts, pairs, pairIndex, nx, ny, -nx * rA, -ny * rA, nx * rB, ny * rB);
}
function narrowPhaseSatContact(spatialFrame, pairs, pairIndex, contacts) {
    const physIdA = pairs.physIdA[pairIndex];
    const physIdB = pairs.physIdB[pairIndex];
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    if (!bodyA || !bodyB) return;
    const slab = kineticDynamicSlab;
    const collided = checkEntityPairCollisionAt(bodyA, slab.x[physIdA], slab.y[physIdA], bodyB, slab.x[physIdB], slab.y[physIdB]);
    if (!collided) return;
    const overlap = SAT_RESULT[0];
    const nx = SAT_RESULT[1];
    const ny = SAT_RESULT[2];
    const coincident = SAT_RESULT[5] !== 0;
    if (coincident) {
        separateCoincidentCircleSlab(physIdA, physIdB, overlap);
        return;
    }
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap);
    const pointCount = SAT_RESULT[8];
    for (let p = 0; p < pointCount; p++) {
        const offset = 9 + p * 4;
        const cx = SAT_RESULT[offset + 0];
        const cy = SAT_RESULT[offset + 1];
        const featureA = SAT_RESULT[offset + 2];
        const featureB = SAT_RESULT[offset + 3];
        appendContact(contacts, pairs, pairIndex, nx, ny, cx - slab.x[physIdA], cy - slab.y[physIdA], cx - slab.x[physIdB], cy - slab.y[physIdB], featureA, featureB);
    }
}
function narrowPhaseKineticContacts(spatialFrame, pairs, contacts) {
    contacts.reset();
    for (let i = 0; i < pairs.count; i++) {
        const tier = pairs.static.tier[i];
        if (tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) narrowPhaseCircleContact(pairs, i, contacts);
        else narrowPhaseSatContact(spatialFrame, pairs, i, contacts);
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
    const { contactImpulseEpsilon } = collisionSettings.kineticEarlyOut;
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
        const bodyA = kineticPairBodyAt(spatialFrame, contacts.physIdA[i]);
        const bodyB = kineticPairBodyAt(spatialFrame, contacts.physIdB[i]);
        if (!bodyA || !bodyB) continue;
        invalidateWallResolveCache(bodyA, bodyB);
        spatialFrame.scheduleKineticActivation(bodyA);
        spatialFrame.scheduleKineticActivation(bodyB);
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
    bumpPairGatherStat(session, "refresh");
    const patchBodies = session.substepPairPatchBodies;
    if (patchBodies?.length) {
        if (patchKineticPairsForBodies(frame, outPairs, patchBodies) > 0) bumpPairGatherStat(session, "patch");
        patchBodies.length = 0;
    }
    return outPairs;
}
export const sleepContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CONTACTS),
    physIdB: new Int32Array(MAX_CONTACTS),
    resting: new Uint8Array(MAX_CONTACTS),
    _index: new Map(),
    reset() {
        this.count = 0;
        this._index.clear();
    },
    add(idA, idB, isResting) {
        const key = pairPhysKey(idA, idB);
        const existing = this._index.get(key);
        if (existing !== undefined) {
            if (isResting) this.resting[existing] = 1;
            return;
        }
        if (this.count < MAX_CONTACTS) {
            this._index.set(key, this.count);
            this.physIdA[this.count] = idA;
            this.physIdB[this.count] = idB;
            this.resting[this.count] = isResting ? 1 : 0;
            this.count++;
        }
    },
};
export function resolveKineticContactPassWithPairs(tick, pairs) {
    const frame = tick.frame;
    const contacts = kineticContactBuffer;
    narrowPhaseKineticContacts(frame, pairs, contacts);
    if (contacts.count === 0) return;
    precomputeKineticContacts(frame, contacts);
    const restingCount = warmStartKineticContacts(contacts);
    tick.world.kinetic.kineticContactStats = solveKineticContactVelocities(contacts, INNER_SOLVE_ITERATIONS, restingCount);
    storeKineticWarmStartCache(contacts);
    applyKineticContactWake(contacts, frame);
    for (let i = 0; i < contacts.count; i++) sleepContactBuffer.add(contacts.physIdA[i], contacts.physIdB[i], contacts.dynamic.resting[i] === 1);
}
// --- MERGED FROM kineticPairStream.js ---
export const KINETIC_PAIR_TIER = { CIRCLE_CIRCLE: 0, CIRCLE_POLY: 1, POLY_POLY: 2, COMPOUND: 3 };
export function classifyKineticPairTier(bodyA, bodyB) {
    if (bodyA.collisionParts?.length > 1 || bodyB.collisionParts?.length > 1) return KINETIC_PAIR_TIER.COMPOUND;
    const shapeA = bodyA.collisionParts?.[0] ?? bodyA.shape;
    const shapeB = bodyB.collisionParts?.[0] ?? bodyB.shape;
    if (shapeA?.shapeTypeId === SHAPE_TYPE_ID.Circle && shapeB?.shapeTypeId === SHAPE_TYPE_ID.Circle) return KINETIC_PAIR_TIER.CIRCLE_CIRCLE;
    if (shapeA?.shapeTypeId === SHAPE_TYPE_ID.Circle || shapeB?.shapeTypeId === SHAPE_TYPE_ID.Circle) return KINETIC_PAIR_TIER.CIRCLE_POLY;
    return KINETIC_PAIR_TIER.POLY_POLY;
}
const PAIR_BODY_KEY_SCALE = 1_000_000;
function createKineticPairBuffer() {
    return {
        count: 0,
        physIdA: new Int32Array(MAX_KINETIC_PAIRS),
        physIdB: new Int32Array(MAX_KINETIC_PAIRS),
        static: {
            tier: new Uint8Array(MAX_KINETIC_PAIRS),
            restitution: new Float32Array(MAX_KINETIC_PAIRS),
            friction: new Float32Array(MAX_KINETIC_PAIRS),
            warmStartPairKey: new Float64Array(MAX_KINETIC_PAIRS),
        },
        reset() {
            this.count = 0;
        },
    };
}
export const kineticPairBuffer = createKineticPairBuffer();
export const persistedKineticPairBuffer = createKineticPairBuffer();
export function copyKineticPairBuffer(from, to) {
    to.count = from.count;
    for (let i = 0; i < from.count; i++) {
        to.physIdA[i] = from.physIdA[i];
        to.physIdB[i] = from.physIdB[i];
        to.static.tier[i] = from.static.tier[i];
        to.static.restitution[i] = from.static.restitution[i];
        to.static.friction[i] = from.static.friction[i];
        to.static.warmStartPairKey[i] = from.static.warmStartPairKey[i];
    }
}
function writePairMaterial(pairs, index, physIdA, physIdB) {
    const slab = kineticStaticSlab;
    const r1 = slab.restitution[physIdA];
    const r2 = slab.restitution[physIdB];
    if (r1 !== -1 && r2 !== -1) pairs.static.restitution[index] = (r1 + r2) * 0.5;
    else pairs.static.restitution[index] = r1 !== -1 ? r1 : r2 !== -1 ? r2 : collisionSettings.restitution.kineticPair;
    const f1 = slab.friction[physIdA];
    const f2 = slab.friction[physIdB];
    if (f1 !== -1 && f2 !== -1) pairs.static.friction[index] = Math.sqrt(f1 * f2);
    else pairs.static.friction[index] = f1 !== -1 ? f1 : f2 !== -1 ? f2 : collisionSettings.pairFriction;
    const idA = slab.entityId[physIdA];
    const idB = slab.entityId[physIdB];
    pairs.static.warmStartPairKey[index] = idA < idB ? idA * PAIR_BODY_KEY_SCALE + idB : idB * PAIR_BODY_KEY_SCALE + idA;
}
export function pairPhysKey(physIdA, physIdB) {
    return physIdA < physIdB ? physIdA * MAX_PHYS_BODIES + physIdB : physIdB * MAX_PHYS_BODIES + physIdA;
}
const compactPairKeyScratch = new Set();
export function compactSubstepKineticPairs(spatialFrame, pairs) {
    if (kineticPairTopologyStale(spatialFrame)) {
        pairs.count = 0;
        return false;
    }
    let write = 0;
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        if (shareKineticIslandSlab(physIdA, physIdB)) continue;
        const tier = pairs.static.tier[i];
        const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
        if (!overlaps) continue;
        if (!shouldResolveKineticPairSlab(physIdA, physIdB, overlaps)) continue;
        if (write !== i) {
            pairs.physIdA[write] = physIdA;
            pairs.physIdB[write] = physIdB;
            pairs.static.tier[write] = tier;
            pairs.static.restitution[write] = pairs.static.restitution[i];
            pairs.static.friction[write] = pairs.static.friction[i];
            pairs.static.warmStartPairKey[write] = pairs.static.warmStartPairKey[i];
        }
        write++;
    }
    pairs.count = write;
    return true;
}
export function patchKineticPairsForBodies(spatialFrame, pairs, bodies) {
    if (!bodies.length) return 0;
    const keys = compactPairKeyScratch;
    keys.clear();
    for (let i = 0; i < pairs.count; i++) keys.add(pairPhysKey(pairs.physIdA[i], pairs.physIdB[i]));
    const slab = kineticDynamicSlab;
    let added = 0;
    const seenPrimary = new Set();
    for (let i = 0; i < bodies.length; i++) {
        const primary = bodies[i];
        if (seenPrimary.has(primary)) continue;
        seenPrimary.add(primary);
        const physIdA = primary._physId;
        if (physIdA === undefined) continue;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const key = pairPhysKey(physIdA, physIdB);
            if (keys.has(key)) continue;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (shareKineticIsland(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) return added;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = tier;
            writePairMaterial(pairs, idx, physIdA, physIdB);
            keys.add(key);
            added++;
        }
    }
    return added;
}
export function kineticPairBodyAt(spatialFrame, physId) {
    const body = spatialFrame.entityGrid.entities[physId];
    if (!body || body._physId !== physId) return null;
    return body;
}
export function kineticPairBodiesAt(spatialFrame, physIdA, physIdB) {
    if (kineticPairTopologyStale(spatialFrame)) return null;
    return kineticContactBodiesAt(spatialFrame, physIdA, physIdB);
}
export function kineticContactBodiesAt(spatialFrame, physIdA, physIdB) {
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    if (!bodyA || !bodyB) return null;
    return { bodyA, bodyB };
}
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    pairs.reset();
    const slab = kineticDynamicSlab;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physIdA = slab.activePhysIds[i];
        const primary = kineticPairBodyAt(spatialFrame, physIdA);
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (shareKineticIsland(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) continue;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.static.tier[idx] = tier;
            writePairMaterial(pairs, idx, physIdA, physIdB);
        }
    }
}
export function separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    const pinnedA = statSlab.pinned[physIdA];
    const pinnedB = statSlab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        dynSlab.x[physIdB] += nx * overlap;
        dynSlab.y[physIdB] += ny * overlap;
        return;
    }
    if (pinnedB) {
        dynSlab.x[physIdA] -= nx * overlap;
        dynSlab.y[physIdA] -= ny * overlap;
        return;
    }
    const massA = statSlab.mass[physIdA];
    const massB = statSlab.mass[physIdB];
    const totalMass = massA + massB;
    dynSlab.x[physIdA] -= nx * overlap * (massB / totalMass);
    dynSlab.y[physIdA] -= ny * overlap * (massB / totalMass);
    dynSlab.x[physIdB] += nx * overlap * (massA / totalMass);
    dynSlab.y[physIdB] += ny * overlap * (massA / totalMass);
}
export function separateCoincidentCircleSlab(physIdA, physIdB, overlap) {
    const dynSlab = kineticDynamicSlab;
    const statSlab = kineticStaticSlab;
    const pinnedA = statSlab.pinned[physIdA];
    const pinnedB = statSlab.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        dynSlab.x[physIdB] += overlap;
        return;
    }
    if (pinnedB) {
        dynSlab.x[physIdA] -= overlap;
        return;
    }
    const massA = statSlab.mass[physIdA];
    const massB = statSlab.mass[physIdB];
    const totalMass = massA + massB;
    dynSlab.x[physIdA] -= overlap * (massB / totalMass);
    dynSlab.x[physIdB] += overlap * (massA / totalMass);
}
