import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { tryFractureKineticContact } from "../../Props/propFracture.js";
import { kineticBroadphaseSlab } from "./kineticBroadphaseSlab.js";
import { kineticKinematicSlab } from "./kineticKinematicSlab.js";
import { kineticPairBodyAt } from "./kineticPairStream.js";
import { KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { COINCIDENT_CIRCLE_EPS } from "./penetration.js";
const MAX_CIRCLE_CONTACTS = 4096;
const PAIR_KEY_SCALE = 1_000_000;
const INNER_SOLVE_ITERATIONS = 4;
export const kineticCircleContactBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_CIRCLE_CONTACTS),
    physIdB: new Int32Array(MAX_CIRCLE_CONTACTS),
    nx: new Float32Array(MAX_CIRCLE_CONTACTS),
    ny: new Float32Array(MAX_CIRCLE_CONTACTS),
    preDvx: new Float32Array(MAX_CIRCLE_CONTACTS),
    preDvy: new Float32Array(MAX_CIRCLE_CONTACTS),
    invMassA: new Float32Array(MAX_CIRCLE_CONTACTS),
    invMassB: new Float32Array(MAX_CIRCLE_CONTACTS),
    invIA: new Float32Array(MAX_CIRCLE_CONTACTS),
    invIB: new Float32Array(MAX_CIRCLE_CONTACTS),
    kNormal: new Float32Array(MAX_CIRCLE_CONTACTS),
    kTangent: new Float32Array(MAX_CIRCLE_CONTACTS),
    rAn: new Float32Array(MAX_CIRCLE_CONTACTS),
    rBn: new Float32Array(MAX_CIRCLE_CONTACTS),
    rAt: new Float32Array(MAX_CIRCLE_CONTACTS),
    rBt: new Float32Array(MAX_CIRCLE_CONTACTS),
    jn: new Float32Array(MAX_CIRCLE_CONTACTS),
    jt: new Float32Array(MAX_CIRCLE_CONTACTS),
    restitution: new Float32Array(MAX_CIRCLE_CONTACTS),
    friction: new Float32Array(MAX_CIRCLE_CONTACTS),
    pairKey: new Float64Array(MAX_CIRCLE_CONTACTS),
    reset() {
        this.count = 0;
    },
};
export function circleCircleContactSlab(physIdA, physIdB) {
    const kin = kineticKinematicSlab;
    const bp = kineticBroadphaseSlab;
    const dx = kin.x[physIdB] - kin.x[physIdA];
    const dy = kin.y[physIdB] - kin.y[physIdA];
    const distSq = dx * dx + dy * dy;
    const radii = bp.r[physIdA] + bp.r[physIdB];
    if (distSq >= radii * radii) return null;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) return { overlap: radii, nx: 0, ny: 0, coincident: true };
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return { overlap, nx, ny, coincident: false };
}
function separateAlongNormalSlab(physIdA, physIdB, nx, ny, overlap) {
    const kin = kineticKinematicSlab;
    const pinnedA = kin.pinned[physIdA];
    const pinnedB = kin.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        kin.x[physIdB] += nx * overlap;
        kin.y[physIdB] += ny * overlap;
        return;
    }
    if (pinnedB) {
        kin.x[physIdA] -= nx * overlap;
        kin.y[physIdA] -= ny * overlap;
        return;
    }
    const massA = kin.mass[physIdA];
    const massB = kin.mass[physIdB];
    const totalMass = massA + massB;
    kin.x[physIdA] -= nx * overlap * (massB / totalMass);
    kin.y[physIdA] -= ny * overlap * (massB / totalMass);
    kin.x[physIdB] += nx * overlap * (massA / totalMass);
    kin.y[physIdB] += ny * overlap * (massA / totalMass);
}
function separateCoincidentCircleSlab(physIdA, physIdB, overlap) {
    const kin = kineticKinematicSlab;
    const pinnedA = kin.pinned[physIdA];
    const pinnedB = kin.pinned[physIdB];
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        kin.x[physIdB] += overlap;
        return;
    }
    if (pinnedB) {
        kin.x[physIdA] -= overlap;
        return;
    }
    const massA = kin.mass[physIdA];
    const massB = kin.mass[physIdB];
    const totalMass = massA + massB;
    kin.x[physIdA] -= overlap * (massB / totalMass);
    kin.x[physIdB] += overlap * (massA / totalMass);
}
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
function appendCircleContact(contacts, physIdA, physIdB, nx, ny, preDvx, preDvy) {
    if (contacts.count >= MAX_CIRCLE_CONTACTS) return;
    const i = contacts.count++;
    contacts.physIdA[i] = physIdA;
    contacts.physIdB[i] = physIdB;
    contacts.nx[i] = nx;
    contacts.ny[i] = ny;
    contacts.preDvx[i] = preDvx;
    contacts.preDvy[i] = preDvy;
}
export function narrowPhaseCircleContacts(spatialFrame, pairs, contacts) {
    contacts.reset();
    const bp = kineticBroadphaseSlab;
    for (let i = 0; i < pairs.count; i++) {
        if (pairs.tier[i] !== KINETIC_PAIR_TIER.CIRCLE_CIRCLE) continue;
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        const info = circleCircleContactSlab(physIdA, physIdB);
        if (!info) continue;
        if (info.coincident) {
            separateCoincidentCircleSlab(physIdA, physIdB, info.overlap);
            continue;
        }
        separateAlongNormalSlab(physIdA, physIdB, info.nx, info.ny, info.overlap);
        appendCircleContact(contacts, physIdA, physIdB, info.nx, info.ny, pairs.preDvx[i], pairs.preDvy[i]);
    }
}
export function precomputeCircleContacts(spatialFrame, contacts) {
    const bp = kineticBroadphaseSlab;
    const kin = kineticKinematicSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        const rA = bp.r[physIdA];
        const rB = bp.r[physIdB];
        const rax = -nx * rA;
        const ray = -ny * rA;
        const rbx = nx * rB;
        const rby = ny * rB;
        const invMassA = kin.invMass[physIdA];
        const invMassB = kin.invMass[physIdB];
        const invIA = kin.invI[physIdA];
        const invIB = kin.invI[physIdB];
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
        contacts.restitution[i] = kineticPairRestitution(bodyA, bodyB);
        contacts.friction[i] = kineticPairFriction(bodyA, bodyB);
        contacts.pairKey[i] = pairContactKey(bodyA, bodyB);
    }
}
function warmStartCacheLookup(key, warmStartKeys) {
    const mask = warmStartKeys.length - 1;
    let idx = (Math.trunc(key / PAIR_KEY_SCALE) ^ (key % PAIR_KEY_SCALE)) & mask;
    while (true) {
        const slot = warmStartKeys[idx];
        if (slot === key) return idx;
        if (slot === 0) return -1;
        idx = (idx + 1) & mask;
    }
}
function applyCachedCircleImpulse(contacts, i) {
    const kin = kineticKinematicSlab;
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
    kin.vx[physIdA] -= jn * nx * invMassA - jt * tx * invMassA;
    kin.vy[physIdA] -= jn * ny * invMassA - jt * ty * invMassA;
    kin.vx[physIdB] += jn * nx * invMassB - jt * tx * invMassB;
    kin.vy[physIdB] += jn * ny * invMassB - jt * ty * invMassB;
    kin.w[physIdA] -= jn * contacts.rAn[i] * contacts.invIA[i] - jt * contacts.rAt[i] * contacts.invIA[i];
    kin.w[physIdB] += jn * contacts.rBn[i] * contacts.invIB[i] - jt * contacts.rBt[i] * contacts.invIB[i];
}
export function warmStartCircleContacts(contacts, warmStartKeys, warmStartJn, warmStartJt) {
    const decay = getCollisionSettings().kineticWarmStartDecay;
    for (let i = 0; i < contacts.count; i++) {
        const key = contacts.pairKey[i];
        const cacheIdx = warmStartCacheLookup(key, warmStartKeys);
        if (cacheIdx === -1) {
            contacts.jn[i] = 0;
            contacts.jt[i] = 0;
            continue;
        }
        contacts.jn[i] = warmStartJn[cacheIdx] * decay;
        contacts.jt[i] = warmStartJt[cacheIdx] * decay;
        applyCachedCircleImpulse(contacts, i);
    }
}
export function solveCircleContactVelocities(contacts, iterations) {
    const kin = kineticKinematicSlab;
    const bp = kineticBroadphaseSlab;
    const count = contacts.count;
    const earlyOut = getCollisionSettings().kineticEarlyOut;
    for (let iter = 0; iter < iterations; iter++) {
        let maxImpulse = 0;
        for (let i = 0; i < count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            const nx = contacts.nx[i];
            const ny = contacts.ny[i];
            const rA = bp.r[physIdA];
            const rB = bp.r[physIdB];
            const rax = -nx * rA;
            const ray = -ny * rA;
            const rbx = nx * rB;
            const rby = ny * rB;
            const wA = kin.w[physIdA];
            const wB = kin.w[physIdB];
            const vAx = kin.vx[physIdA] - wA * ray;
            const vAy = kin.vy[physIdA] + wA * rax;
            const vBx = kin.vx[physIdB] - wB * rby;
            const vBy = kin.vy[physIdB] + wB * rbx;
            const velAlongNormal = (vBx - vAx) * nx + (vBy - vAy) * ny;
            let j = (-(1 + contacts.restitution[i]) * velAlongNormal) / contacts.kNormal[i];
            const oldJn = contacts.jn[i];
            contacts.jn[i] = Math.max(oldJn + j, 0);
            j = contacts.jn[i] - oldJn;
            const invMassA = contacts.invMassA[i];
            const invMassB = contacts.invMassB[i];
            if (j !== 0) {
                maxImpulse = Math.max(maxImpulse, Math.abs(j));
                kin.vx[physIdA] -= j * nx * invMassA;
                kin.vy[physIdA] -= j * ny * invMassA;
                kin.vx[physIdB] += j * nx * invMassB;
                kin.vy[physIdB] += j * ny * invMassB;
                kin.w[physIdA] -= j * contacts.rAn[i] * contacts.invIA[i];
                kin.w[physIdB] += j * contacts.rBn[i] * contacts.invIB[i];
            }
            const tx = -ny;
            const ty = nx;
            const wAn = kin.w[physIdA];
            const wBn = kin.w[physIdB];
            const vAxT = kin.vx[physIdA] - wAn * ray;
            const vAyT = kin.vy[physIdA] + wAn * rax;
            const vBxT = kin.vx[physIdB] - wBn * rby;
            const vByT = kin.vy[physIdB] + wBn * rbx;
            const vt = (vAxT - vBxT) * tx + (vAyT - vByT) * ty;
            let jt = -vt / contacts.kTangent[i];
            const maxFriction = contacts.jn[i] * contacts.friction[i];
            const oldJt = contacts.jt[i];
            contacts.jt[i] = Math.max(-maxFriction, Math.min(maxFriction, oldJt + jt));
            jt = contacts.jt[i] - oldJt;
            if (jt === 0) continue;
            maxImpulse = Math.max(maxImpulse, Math.abs(jt));
            kin.vx[physIdA] += jt * tx * invMassA;
            kin.vy[physIdA] += jt * ty * invMassA;
            kin.vx[physIdB] -= jt * tx * invMassB;
            kin.vy[physIdB] -= jt * ty * invMassB;
            kin.w[physIdA] += jt * contacts.rAt[i] * contacts.invIA[i];
            kin.w[physIdB] -= jt * contacts.rBt[i] * contacts.invIB[i];
        }
        if (earlyOut.enabled && iter + 1 >= earlyOut.contactMinIterations && maxImpulse <= earlyOut.contactImpulseEpsilon) break;
    }
}
export function collectCircleContactPhysIds(contacts) {
    const touched = new Set();
    for (let i = 0; i < contacts.count; i++) {
        touched.add(contacts.physIdA[i]);
        touched.add(contacts.physIdB[i]);
    }
    return [...touched];
}
export function applyCircleContactEffects(contacts, spatialFrame, state) {
    const bp = kineticBroadphaseSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
        const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
        const nx = contacts.nx[i];
        const ny = contacts.ny[i];
        const hitX = bodyA.x - nx * bp.r[physIdA];
        const hitY = bodyA.y - ny * bp.r[physIdA];
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        tryFractureKineticContact(state, bodyA, bodyB, hitX, hitY, relSpeed, spatialFrame);
        invalidateWallResolveCache(bodyA, bodyB);
        spatialFrame.scheduleKineticActivation(bodyA);
        spatialFrame.scheduleKineticActivation(bodyB);
    }
}
