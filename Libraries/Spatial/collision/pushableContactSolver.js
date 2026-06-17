import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { canSplittableWorldPropSplit } from "../../Props/splittable.js";
import { invalidateWallResolveCache } from "../../Motion/WallCollisionResolver.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { allowsPushableCollisionPair, pairBroadphaseOverlap } from "./entityBroadphase.js";
import { separateAlongNormal, separateCoincidentCirclePair } from "./penetration.js";
import { SatCollision } from "./SatCollision.js";
const MAX_CONTACTS = 4096;
const INNER_SOLVE_ITERATIONS = 4;
const pushableContactBuffer = {
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
    rAn: new Float32Array(MAX_CONTACTS),
    rBn: new Float32Array(MAX_CONTACTS),
    jn: new Float32Array(MAX_CONTACTS),
    restitution: new Float32Array(MAX_CONTACTS),
    reset() {
        this.count = 0;
    },
};
function pushablePairRestitution(bodyA, bodyB) {
    const r1 = bodyA.strategy?.pairRestitution;
    const r2 = bodyB.strategy?.pairRestitution;
    if (r1 != null && r2 != null) return (r1 + r2) * 0.5;
    return r1 ?? r2 ?? getCollisionSettings().restitution.pushablePair;
}
function invMoment(body) {
    const moment = body.momentOfInertia;
    return moment ? 1 / moment : 0;
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
function gatherPushableContacts(spatialFrame, contacts) {
    contacts.reset();
    const active = spatialFrame._activePushables;
    for (let i = 0; i < active.length; i++) {
        const primary = active[i];
        if (primary.isDead) continue;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            if (neighbor.isSleeping && pairBroadphaseOverlap(primary, neighbor)) spatialFrame.activatePushable(neighbor);
            if (!allowsPushableCollisionPair(primary, neighbor)) continue;
            const preDvx = (neighbor.vx ?? 0) - (primary.vx ?? 0);
            const preDvy = (neighbor.vy ?? 0) - (primary.vy ?? 0);
            const info = detectAndSeparateContact(primary, neighbor);
            if (!info) continue;
            appendContact(contacts, primary, neighbor, info, preDvx, preDvy);
        }
    }
}
function precomputePushableContacts(contacts) {
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
        contacts.invMassA[i] = invMassA;
        contacts.invMassB[i] = invMassB;
        contacts.invMassSum[i] = invMassA + invMassB;
        contacts.invIA[i] = invIA;
        contacts.invIB[i] = invIB;
        contacts.rAn[i] = rAn;
        contacts.rBn[i] = rBn;
        contacts.kNormal[i] = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        contacts.restitution[i] = pushablePairRestitution(bodyA, bodyB);
        contacts.jn[i] = 0;
    }
}
function solvePushableContactVelocities(contacts, iterations) {
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
            if (j === 0) continue;
            const invMassA = contacts.invMassA[i];
            const invMassB = contacts.invMassB[i];
            bodyA.vx = (bodyA.vx || 0) - j * nx * invMassA;
            bodyA.vy = (bodyA.vy || 0) - j * ny * invMassA;
            bodyB.vx = (bodyB.vx || 0) + j * nx * invMassB;
            bodyB.vy = (bodyB.vy || 0) + j * ny * invMassB;
            bodyA.angularVelocity = wA - j * contacts.rAn[i] * contacts.invIA[i];
            bodyB.angularVelocity = wB + j * contacts.rBn[i] * contacts.invIB[i];
        }
}
function applyPushableCollisionDamage(body, dmg, state) {
    if (dmg <= 0 || !body.takeDamage) return;
    if (body.strategy?.splittable && !canSplittableWorldPropSplit(body)) return;
    body.takeDamage(dmg, state);
}
function applyPushableContactEffects(contacts, spatialFrame, state) {
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = contacts.bodyA[i];
        const bodyB = contacts.bodyB[i];
        const preSpeedSq = contacts.preDvx[i] * contacts.preDvx[i] + contacts.preDvy[i] * contacts.preDvy[i];
        if (preSpeedSq > 8000) {
            const dmg = Math.floor(Math.sqrt(preSpeedSq) / 60);
            applyPushableCollisionDamage(bodyA, dmg, state);
            applyPushableCollisionDamage(bodyB, dmg, state);
        }
        invalidateWallResolveCache(bodyA, bodyB);
        wakePushableBody(bodyA);
        wakePushableBody(bodyB);
        spatialFrame.activatePushable(bodyA);
        spatialFrame.activatePushable(bodyB);
    }
}
export function resolvePushableContactPass(spatialFrame, state) {
    const contacts = pushableContactBuffer;
    gatherPushableContacts(spatialFrame, contacts);
    if (contacts.count === 0) return;
    precomputePushableContacts(contacts);
    solvePushableContactVelocities(contacts, INNER_SOLVE_ITERATIONS);
    applyPushableContactEffects(contacts, spatialFrame, state);
}
export function resolveActivePushablePairs(spatialFrame, state, outerIterations = getCollisionSettings().pushableIterations) {
    for (let outer = 0; outer < outerIterations; outer++) resolvePushableContactPass(spatialFrame, state);
}
