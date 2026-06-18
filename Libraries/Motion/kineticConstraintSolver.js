import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "./bodyMass.js";
import { distanceBetweenAnchors, worldAnchorFromBody } from "./constraintAnchors.js";
import { wakeKineticBody } from "./kineticSleep.js";
import { separateAlongNormal } from "../Spatial/collision/penetration.js";
const MAX_KINETIC_CONSTRAINTS = 2048;
const kineticConstraintBuffer = {
    count: 0,
    bodyA: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyB: new Array(MAX_KINETIC_CONSTRAINTS),
    anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    reset() {
        this.count = 0;
    },
};
function gatherKineticConstraints(state, buffer) {
    buffer.reset();
    const list = state.sandbox.kineticConstraints;
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        const bodyA = state.entityRegistry.getLive(entry.bodyAId);
        const bodyB = state.entityRegistry.getLive(entry.bodyBId);
        if (!bodyA?.strategy?.isKinetic || !bodyB?.strategy?.isKinetic) continue;
        if (buffer.count >= MAX_KINETIC_CONSTRAINTS) continue;
        const idx = buffer.count++;
        buffer.bodyA[idx] = bodyA;
        buffer.bodyB[idx] = bodyB;
        buffer.anchorAx[idx] = entry.anchorA.x;
        buffer.anchorAy[idx] = entry.anchorA.y;
        buffer.anchorBx[idx] = entry.anchorB.x;
        buffer.anchorBy[idx] = entry.anchorB.y;
        buffer.restLength[idx] = entry.restLength;
    }
}
function solveDistanceConstraint(buffer, index, spatialFrame) {
    const bodyA = buffer.bodyA[index];
    const bodyB = buffer.bodyB[index];
    let wa = worldAnchorFromBody(bodyA, buffer.anchorAx[index], buffer.anchorAy[index]);
    let wb = worldAnchorFromBody(bodyB, buffer.anchorBx[index], buffer.anchorBy[index]);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - buffer.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormal(bodyA, bodyB, nx, ny, -error, massFromBody(bodyA), massFromBody(bodyB), bodyPinnedForContact(bodyA), bodyPinnedForContact(bodyB));
    wa = worldAnchorFromBody(bodyA, buffer.anchorAx[index], buffer.anchorAy[index]);
    wb = worldAnchorFromBody(bodyB, buffer.anchorBx[index], buffer.anchorBy[index]);
    const invMassA = inverseMassFromBody(bodyA);
    const invMassB = inverseMassFromBody(bodyB);
    const rax = wa.x - bodyA.x;
    const ray = wa.y - bodyA.y;
    const rbx = wb.x - bodyB.x;
    const rby = wb.y - bodyB.y;
    const invIA = bodyA.momentOfInertia ? 1 / bodyA.momentOfInertia : 0;
    const invIB = bodyB.momentOfInertia ? 1 / bodyB.momentOfInertia : 0;
    const rAn = rax * ny - ray * nx;
    const rBn = rbx * ny - rby * nx;
    const k = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
    if (k <= 1e-12) return;
    const vAx = (bodyA.vx ?? 0) - (bodyA.angularVelocity ?? 0) * ray;
    const vAy = (bodyA.vy ?? 0) + (bodyA.angularVelocity ?? 0) * rax;
    const vBx = (bodyB.vx ?? 0) - (bodyB.angularVelocity ?? 0) * rby;
    const vBy = (bodyB.vy ?? 0) + (bodyB.angularVelocity ?? 0) * rbx;
    const vRelN = (vBx - vAx) * nx + (vBy - vAy) * ny;
    const bias = getCollisionSettings().kineticConstraints.velocityBias;
    const lambda = -(vRelN + bias * error) / k;
    if (lambda === 0) return;
    bodyA.vx = (bodyA.vx ?? 0) - lambda * nx * invMassA;
    bodyA.vy = (bodyA.vy ?? 0) - lambda * ny * invMassA;
    bodyB.vx = (bodyB.vx ?? 0) + lambda * nx * invMassB;
    bodyB.vy = (bodyB.vy ?? 0) + lambda * ny * invMassB;
    bodyA.angularVelocity = (bodyA.angularVelocity ?? 0) - lambda * rAn * invIA;
    bodyB.angularVelocity = (bodyB.angularVelocity ?? 0) + lambda * rBn * invIB;
    wakeKineticBody(bodyA);
    wakeKineticBody(bodyB);
    spatialFrame.activateKineticBody(bodyA);
    spatialFrame.activateKineticBody(bodyB);
}
export function resolveKineticConstraintPass(spatialFrame, state) {
    gatherKineticConstraints(state, kineticConstraintBuffer);
    if (kineticConstraintBuffer.count === 0) return;
    const iterations = getCollisionSettings().kineticConstraints.iterations;
    for (let iter = 0; iter < iterations; iter++) for (let i = 0; i < kineticConstraintBuffer.count; i++) solveDistanceConstraint(kineticConstraintBuffer, i, spatialFrame);
}
export function measureDistanceConstraintError(state, constraint) {
    const bodyA = state.entityRegistry.getLive(constraint.bodyAId);
    const bodyB = state.entityRegistry.getLive(constraint.bodyBId);
    if (!bodyA || !bodyB) return Infinity;
    return Math.abs(distanceBetweenAnchors(bodyA, constraint.anchorA, bodyB, constraint.anchorB) - constraint.restLength);
}
