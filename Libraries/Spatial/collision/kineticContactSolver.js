import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { fractureSplittableOnImpact, impactForceFromContact } from "../../Props/splittableWorldProp.js";
import { allowsKineticCollisionPair, pairBroadphaseOverlap } from "./entityBroadphase.js";
import { separateAlongNormal, separateCoincidentCirclePair } from "./penetration.js";
import { SatCollision } from "./SatCollision.js";
const MAX_CONTACTS = 4096;
const INNER_SOLVE_ITERATIONS = 4;
const PAIR_KEY_SCALE = 1_000_000;
const WARM_START_CACHE_SIZE = 16384;
const WARM_START_CACHE_MASK = WARM_START_CACHE_SIZE - 1;
const warmStartKeys = new Float64Array(WARM_START_CACHE_SIZE);
const warmStartJn = new Float32Array(WARM_START_CACHE_SIZE);
const warmStartJt = new Float32Array(WARM_START_CACHE_SIZE);
const kineticContactBuffer = {
    count: 0,
    bodyA: new Array(MAX_CONTACTS),
    bodyB: new Array(MAX_CONTACTS),
    nx: new Float32Array(MAX_CONTACTS),
    ny: new Float32Array(MAX_CONTACTS),
    rax: new Float32Array(MAX_CONTACTS),
    ray: new Float32Array(MAX_CONTACTS),
    rbx: new Float32Array(MAX_CONTACTS),
    rby: new Float32Array(MAX_CONTACTS),
    preDvx: new Float32Array(MAX_CONTACTS),
    preDvy: new Float32Array(MAX_CONTACTS),
    invMassA: new Float32Array(MAX_CONTACTS),
    invMassB: new Float32Array(MAX_CONTACTS),
    invMassSum: new Float32Array(MAX_CONTACTS),
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
    pairKey: new Float64Array(MAX_CONTACTS),
    reset() {
        this.count = 0;
    },
};
function pairContactKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? bodyA.id * PAIR_KEY_SCALE + bodyB.id : bodyB.id * PAIR_KEY_SCALE + bodyA.id;
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
function invMoment(body) {
    const moment = body.momentOfInertia;
    return moment ? 1 / moment : 0;
}
function warmStartCacheLookup(key) {
    let idx = (Math.trunc(key / PAIR_KEY_SCALE) ^ (key % PAIR_KEY_SCALE)) & WARM_START_CACHE_MASK;
    while (true) {
        const slot = warmStartKeys[idx];
        if (slot === key) return idx;
        if (slot === 0) return -1;
        idx = (idx + 1) & WARM_START_CACHE_MASK;
    }
}
function applyCachedContactImpulse(contacts, i) {
    const bodyA = contacts.bodyA[i];
    const bodyB = contacts.bodyB[i];
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    const tx = -ny;
    const ty = nx;
    const jn = contacts.jn[i];
    const jt = contacts.jt[i];
    const invMassA = contacts.invMassA[i];
    const invMassB = contacts.invMassB[i];
    bodyA.vx = (bodyA.vx || 0) - jn * nx * invMassA + jt * tx * invMassA;
    bodyA.vy = (bodyA.vy || 0) - jn * ny * invMassA + jt * ty * invMassA;
    bodyB.vx = (bodyB.vx || 0) + jn * nx * invMassB - jt * tx * invMassB;
    bodyB.vy = (bodyB.vy || 0) + jn * ny * invMassB - jt * ty * invMassB;
    bodyA.angularVelocity = (bodyA.angularVelocity || 0) - jn * contacts.rAn[i] * contacts.invIA[i] + jt * contacts.rAt[i] * contacts.invIA[i];
    bodyB.angularVelocity = (bodyB.angularVelocity || 0) + jn * contacts.rBn[i] * contacts.invIB[i] - jt * contacts.rBt[i] * contacts.invIB[i];
}
function warmStartKineticContacts(contacts) {
    const decay = getCollisionSettings().kineticWarmStartDecay;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.pairKey[i];
        const cacheIdx = warmStartCacheLookup(key);
        if (cacheIdx === -1) {
            contacts.jn[i] = 0;
            contacts.jt[i] = 0;
            continue;
        }
        contacts.jn[i] = warmStartJn[cacheIdx] * decay;
        contacts.jt[i] = warmStartJt[cacheIdx] * decay;
        applyCachedContactImpulse(contacts, i);
    }
}
function storeKineticWarmStartCache(contacts) {
    warmStartKeys.fill(0);
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.pairKey[i];
        let idx = (Math.trunc(key / PAIR_KEY_SCALE) ^ (key % PAIR_KEY_SCALE)) & WARM_START_CACHE_MASK;
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
function contactLeverArms(bodyA, bodyB, shapeA, shapeB, info) {
    const nx = info.nx;
    const ny = info.ny;
    if (shapeA.type === "Circle" && shapeB.type === "Circle") return { rax: -nx * shapeA.radius, ray: -ny * shapeA.radius, rbx: nx * shapeB.radius, rby: ny * shapeB.radius };
    const cx = info.cx ?? bodyA.x + nx * (info.overlap / 2);
    const cy = info.cy ?? bodyA.y + ny * (info.overlap / 2);
    return { rax: cx - bodyA.x, ray: cy - bodyA.y, rbx: cx - bodyB.x, rby: cy - bodyB.y };
}
function detectAndSeparateContact(bodyA, bodyB) {
    const shapeA = bodyA.getShape();
    const shapeB = bodyB.getShape();
    const massA = massFromBody(bodyA);
    const massB = massFromBody(bodyB);
    const info = SatCollision.checkCollision(bodyA, shapeA, bodyB, shapeB);
    if (!info) return null;
    if (info.coincident) {
        separateCoincidentCirclePair(bodyA, bodyB, info.overlap, massA, massB);
        return null;
    }
    separateAlongNormal(bodyA, bodyB, info.nx, info.ny, info.overlap, massA, massB);
    return info;
}
function appendContact(contacts, bodyA, bodyB, info, preDvx, preDvy) {
    if (contacts.count >= MAX_CONTACTS) return;
    const shapeA = bodyA.getShape();
    const shapeB = bodyB.getShape();
    const arms = contactLeverArms(bodyA, bodyB, shapeA, shapeB, info);
    const i = contacts.count++;
    contacts.bodyA[i] = bodyA;
    contacts.bodyB[i] = bodyB;
    contacts.nx[i] = info.nx;
    contacts.ny[i] = info.ny;
    contacts.rax[i] = arms.rax;
    contacts.ray[i] = arms.ray;
    contacts.rbx[i] = arms.rbx;
    contacts.rby[i] = arms.rby;
    contacts.preDvx[i] = preDvx;
    contacts.preDvy[i] = preDvy;
}
function gatherKineticContacts(spatialFrame, contacts) {
    contacts.reset();
    const active = spatialFrame._activeKineticBodies;
    for (let i = 0; i < active.length; i++) {
        const primary = active[i];
        if (primary.isDead) continue;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            if (neighbor.isSleeping && pairBroadphaseOverlap(primary, neighbor)) spatialFrame.activateKineticBody(neighbor);
            if (!allowsKineticCollisionPair(primary, neighbor)) continue;
            const preDvx = (neighbor.vx ?? 0) - (primary.vx ?? 0);
            const preDvy = (neighbor.vy ?? 0) - (primary.vy ?? 0);
            const info = detectAndSeparateContact(primary, neighbor);
            if (!info) continue;
            appendContact(contacts, primary, neighbor, info, preDvx, preDvy);
        }
    }
}
function precomputeKineticContacts(contacts) {
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = contacts.bodyA[i];
        const bodyB = contacts.bodyB[i];
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        const invMassA = 1 / massFromBody(bodyA);
        const invMassB = 1 / massFromBody(bodyB);
        const invIA = invMoment(bodyA);
        const invIB = invMoment(bodyB);
        const rax = contacts.rax[i];
        const ray = contacts.ray[i];
        const rbx = contacts.rbx[i];
        const rby = contacts.rby[i];
        const rAn = rax * ny - ray * nx;
        const rBn = rbx * ny - rby * nx;
        const rAt = rax * nx + ray * ny;
        const rBt = rbx * nx + rby * ny;
        contacts.invMassA[i] = invMassA;
        contacts.invMassB[i] = invMassB;
        contacts.invMassSum[i] = invMassA + invMassB;
        contacts.invIA[i] = invIA;
        contacts.invIB[i] = invIB;
        contacts.rAn[i] = rAn;
        contacts.rBn[i] = rBn;
        contacts.rAt[i] = rAt;
        contacts.rBt[i] = rBt;
        contacts.kNormal[i] = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        contacts.kTangent[i] = invMassA + invMassB + rAt * rAt * invIA + rBt * rBt * invIB;
        contacts.restitution[i] = kineticPairRestitution(bodyA, bodyB);
        contacts.friction[i] = kineticPairFriction(bodyA, bodyB);
        contacts.pairKey[i] = pairContactKey(bodyA, bodyB);
    }
}
function solveKineticContactVelocities(contacts, iterations) {
    const count = contacts.count;
    for (let iter = 0; iter < iterations; iter++)
        for (let i = 0; i < count; i++) {
            const bodyA = contacts.bodyA[i];
            const bodyB = contacts.bodyB[i];
            const nx = contacts.nx[i];
            const ny = contacts.ny[i];
            const rax = contacts.rax[i];
            const ray = contacts.ray[i];
            const rbx = contacts.rbx[i];
            const rby = contacts.rby[i];
            const wA = bodyA.angularVelocity || 0;
            const wB = bodyB.angularVelocity || 0;
            const vAx = (bodyA.vx || 0) - wA * ray;
            const vAy = (bodyA.vy || 0) + wA * rax;
            const vBx = (bodyB.vx || 0) - wB * rby;
            const vBy = (bodyB.vy || 0) + wB * rbx;
            const velAlongNormal = (vBx - vAx) * nx + (vBy - vAy) * ny;
            let j = (-(1 + contacts.restitution[i]) * velAlongNormal) / contacts.kNormal[i];
            const oldJn = contacts.jn[i];
            contacts.jn[i] = Math.max(oldJn + j, 0);
            j = contacts.jn[i] - oldJn;
            const invMassA = contacts.invMassA[i];
            const invMassB = contacts.invMassB[i];
            if (j !== 0) {
                bodyA.vx = (bodyA.vx || 0) - j * nx * invMassA;
                bodyA.vy = (bodyA.vy || 0) - j * ny * invMassA;
                bodyB.vx = (bodyB.vx || 0) + j * nx * invMassB;
                bodyB.vy = (bodyB.vy || 0) + j * ny * invMassB;
                bodyA.angularVelocity = wA - j * contacts.rAn[i] * contacts.invIA[i];
                bodyB.angularVelocity = wB + j * contacts.rBn[i] * contacts.invIB[i];
            }
            const tx = -ny;
            const ty = nx;
            const wAn = bodyA.angularVelocity || 0;
            const wBn = bodyB.angularVelocity || 0;
            const vAxT = (bodyA.vx || 0) - wAn * ray;
            const vAyT = (bodyA.vy || 0) + wAn * rax;
            const vBxT = (bodyB.vx || 0) - wBn * rby;
            const vByT = (bodyB.vy || 0) + wBn * rbx;
            const vt = (vAxT - vBxT) * tx + (vAyT - vByT) * ty;
            let jt = -vt / contacts.kTangent[i];
            const maxFriction = contacts.jn[i] * contacts.friction[i];
            const oldJt = contacts.jt[i];
            contacts.jt[i] = Math.max(-maxFriction, Math.min(maxFriction, oldJt + jt));
            jt = contacts.jt[i] - oldJt;
            if (jt === 0) continue;
            bodyA.vx = (bodyA.vx || 0) + jt * tx * invMassA;
            bodyA.vy = (bodyA.vy || 0) + jt * ty * invMassA;
            bodyB.vx = (bodyB.vx || 0) - jt * tx * invMassB;
            bodyB.vy = (bodyB.vy || 0) - jt * ty * invMassB;
            bodyA.angularVelocity = wAn + jt * contacts.rAt[i] * contacts.invIA[i];
            bodyB.angularVelocity = wBn - jt * contacts.rBt[i] * contacts.invIB[i];
        }
}
const SPLITTABLE_MIN_IMPACT_FORCE = 25;
function trySplittableFracture(state, prop, other, hitX, hitY, relativeSpeed, impactDirX, impactDirY) {
    if (!prop.strategy?.splittable || prop.poxels?.length <= 1) return;
    const force = impactForceFromContact(relativeSpeed, massFromBody(prop), massFromBody(other));
    if (force < SPLITTABLE_MIN_IMPACT_FORCE) return;
    const fracture = fractureSplittableOnImpact(prop, hitX, hitY, force);
    if (!fracture) return;
    prop.spawnSplittableFragments(state, fracture.debris, { originX: fracture.originX, originY: fracture.originY, impactDirX, impactDirY });
    wakeKineticBody(prop);
}
function applyKineticContactEffects(contacts, spatialFrame, state) {
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = contacts.bodyA[i];
        const bodyB = contacts.bodyB[i];
        invalidateWallResolveCache(bodyA, bodyB);
        wakeKineticBody(bodyA);
        wakeKineticBody(bodyB);
        spatialFrame.activateKineticBody(bodyA);
        spatialFrame.activateKineticBody(bodyB);
        const relativeSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        if (relativeSpeed <= 0) continue;
        const hitX = bodyA.x + contacts.rax[i];
        const hitY = bodyA.y + contacts.ray[i];
        trySplittableFracture(state, bodyA, bodyB, hitX, hitY, relativeSpeed, contacts.preDvx[i], contacts.preDvy[i]);
        trySplittableFracture(state, bodyB, bodyA, hitX, hitY, relativeSpeed, -contacts.preDvx[i], -contacts.preDvy[i]);
    }
}
export function resolveKineticContactPass(spatialFrame, state) {
    const contacts = kineticContactBuffer;
    gatherKineticContacts(spatialFrame, contacts);
    if (contacts.count === 0) return;
    precomputeKineticContacts(contacts);
    warmStartKineticContacts(contacts);
    solveKineticContactVelocities(contacts, INNER_SOLVE_ITERATIONS);
    storeKineticWarmStartCache(contacts);
    applyKineticContactEffects(contacts, spatialFrame, state);
}
