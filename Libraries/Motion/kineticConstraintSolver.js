import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "./bodyMass.js";
import { distanceBetweenAnchors, worldAnchorFromBody } from "./constraintAnchors.js";
import { getLinkCapsuleSegmentPenetration } from "../Spatial/geometry/WallGeometry.js";
import { getEntityCollisionParts } from "../Spatial/collision/SatCollision.js";
import { separateAlongNormal, applyPositionCorrection } from "../Spatial/collision/penetration.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { wakeKineticBody } from "./kineticSleep.js";
const LINK_CAPSULE_WALL_PASSES = 2;
const MAX_KINETIC_CONSTRAINTS = 2048;
const MAX_ISLAND_GROUPS = 256;
const CONSTRAINT_EDGE_KEY_SCALE = 1_000_000;
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
const kineticConstraintGroups = {
    count: 0,
    starts: new Int32Array(MAX_ISLAND_GROUPS),
    counts: new Int32Array(MAX_ISLAND_GROUPS),
    reset() {
        this.count = 0;
    },
};
function constraintEdgeKey(bodyAId, bodyBId) {
    return bodyAId < bodyBId ? bodyAId * CONSTRAINT_EDGE_KEY_SCALE + bodyBId : bodyBId * CONSTRAINT_EDGE_KEY_SCALE + bodyAId;
}
function orderIslandConstraintItems(items) {
    if (items.length <= 1) return items;
    const bodyById = new Map();
    const bodySet = new Set();
    const byEdge = new Map();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        bodyById.set(item.bodyA.id, item.bodyA);
        bodyById.set(item.bodyB.id, item.bodyB);
        bodySet.add(item.bodyA.id);
        bodySet.add(item.bodyB.id);
        byEdge.set(constraintEdgeKey(item.bodyA.id, item.bodyB.id), item);
    }
    let startId = null;
    for (const id of bodySet) {
        const body = bodyById.get(id);
        const inIsland = (body._kineticLinkNeighbors ?? []).filter((neighbor) => bodySet.has(neighbor.id));
        if (inIsland.length <= 1) {
            startId = id;
            break;
        }
    }
    if (startId == null) {
        let minId = Infinity;
        for (const id of bodySet) if (id < minId) minId = id;
        startId = minId;
    }
    const ordered = [];
    const usedEdges = new Set();
    let currentId = startId;
    while (ordered.length < items.length) {
        const body = bodyById.get(currentId);
        const neighbors = body._kineticLinkNeighbors ?? [];
        let advanced = false;
        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i];
            if (!bodySet.has(neighbor.id)) continue;
            const key = constraintEdgeKey(currentId, neighbor.id);
            if (usedEdges.has(key)) continue;
            const item = byEdge.get(key);
            if (!item) continue;
            ordered.push(item);
            usedEdges.add(key);
            currentId = neighbor.id;
            advanced = true;
            break;
        }
        if (!advanced) break;
    }
    for (let i = 0; i < items.length; i++) {
        const key = constraintEdgeKey(items[i].bodyA.id, items[i].bodyB.id);
        if (!usedEdges.has(key)) ordered.push(items[i]);
    }
    return ordered;
}
function appendConstraintEntry(buffer, item) {
    const idx = buffer.count++;
    buffer.bodyA[idx] = item.bodyA;
    buffer.bodyB[idx] = item.bodyB;
    buffer.anchorAx[idx] = item.entry.anchorA.x;
    buffer.anchorAy[idx] = item.entry.anchorA.y;
    buffer.anchorBx[idx] = item.entry.anchorB.x;
    buffer.anchorBy[idx] = item.entry.anchorB.y;
    buffer.restLength[idx] = item.entry.restLength;
}
function islandConstraintsAsleep(buffer, start, count) {
    for (let i = start; i < start + count; i++) {
        const bodyA = buffer.bodyA[i];
        const bodyB = buffer.bodyB[i];
        if (!bodyA.isSleeping || !bodyB.isSleeping) return false;
    }
    return count > 0;
}
export function gatherKineticConstraintBuffer(tick, buffer = kineticConstraintBuffer, groups = kineticConstraintGroups) {
    buffer.reset();
    groups.reset();
    const { frame, world } = tick;
    const session = world.kinetic;
    const registry = world.entityRegistry;
    const plan = ensureKineticIslandPlan(session, frame._kineticBodies);
    const list = session.kineticConstraints;
    const buckets = new Map();
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        const bodyA = registry.getLive(entry.bodyAId);
        const bodyB = registry.getLive(entry.bodyBId);
        if (!bodyA?.strategy?.isKinetic || !bodyB?.strategy?.isKinetic) continue;
        const root = plan.bodyIdToIslandRoot.get(bodyA.id) ?? bodyA.id;
        if (!buckets.has(root)) buckets.set(root, []);
        buckets.get(root).push({ entry, bodyA, bodyB });
    }
    for (const items of buckets.values()) {
        if (buffer.count >= MAX_KINETIC_CONSTRAINTS || groups.count >= MAX_ISLAND_GROUPS) break;
        const ordered = orderIslandConstraintItems(items);
        const start = buffer.count;
        for (let i = 0; i < ordered.length; i++) {
            if (buffer.count >= MAX_KINETIC_CONSTRAINTS) break;
            appendConstraintEntry(buffer, ordered[i]);
        }
        const count = buffer.count - start;
        if (count === 0) continue;
        groups.starts[groups.count] = start;
        groups.counts[groups.count] = count;
        groups.count++;
    }
    return { buffer, groups };
}
function circleRadiusFromBody(body) {
    const parts = getEntityCollisionParts(body);
    for (let i = 0; i < parts.length; i++) if (parts[i].type === "Circle") return parts[i].radius;
    return body.radius;
}
function linkCapsuleRadius(bodyA, bodyB) {
    return Math.max(circleRadiusFromBody(bodyA), circleRadiusFromBody(bodyB));
}
function linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, segment) {
    const reach = capsuleRadius + segment.size * 0.75;
    const minX = Math.min(ax, bx) - reach;
    const maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach;
    const maxY = Math.max(ay, by) + reach;
    return segment.x >= minX && segment.x <= maxX && segment.y >= minY && segment.y <= maxY;
}
function gatherLinkWallCandidates(spatialFrame, bodyA, bodyB, out) {
    out.length = 0;
    const candidatesA = spatialFrame.getWallCandidates(bodyA);
    const candidatesB = spatialFrame.getWallCandidates(bodyB);
    for (let i = 0; i < candidatesA.length; i++) out.push(candidatesA[i]);
    for (let i = 0; i < candidatesB.length; i++) {
        const seg = candidatesB[i];
        let seen = false;
        for (let j = 0; j < candidatesA.length; j++)
            if (candidatesA[j] === seg) {
                seen = true;
                break;
            }
        if (!seen) out.push(seg);
    }
}
function translateLinkAwayFromWall(bodyA, bodyB, normalX, normalY, overlap, pinnedA, pinnedB) {
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        applyPositionCorrection(bodyB, normalX, normalY, overlap);
        return;
    }
    if (pinnedB) {
        applyPositionCorrection(bodyA, normalX, normalY, overlap);
        return;
    }
    applyPositionCorrection(bodyA, normalX, normalY, overlap);
    applyPositionCorrection(bodyB, normalX, normalY, overlap);
}
function projectDistanceLinkCapsuleAgainstWalls(bodyA, bodyB, anchorAx, anchorAy, anchorBx, anchorBy, walls, spatialFrame) {
    const capsuleRadius = linkCapsuleRadius(bodyA, bodyB);
    const approachX = ((bodyA.vx ?? 0) + (bodyB.vx ?? 0)) * 0.5;
    const approachY = ((bodyA.vy ?? 0) + (bodyB.vy ?? 0)) * 0.5;
    const pinnedA = bodyPinnedForContact(bodyA);
    const pinnedB = bodyPinnedForContact(bodyB);
    for (let pass = 0; pass < LINK_CAPSULE_WALL_PASSES; pass++) {
        const wa = worldAnchorFromBody(bodyA, anchorAx, anchorAy);
        const wb = worldAnchorFromBody(bodyB, anchorBx, anchorBy);
        let best = null;
        for (let i = 0; i < walls.length; i++) {
            const seg = walls[i];
            if (seg.passageEdge) continue;
            if (!linkSegmentOverlapsWall(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg)) continue;
            const penetration = getLinkCapsuleSegmentPenetration(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg, { approachX, approachY });
            if (!penetration || penetration.overlap <= 0) continue;
            if (!best || penetration.overlap > best.overlap) best = penetration;
        }
        if (!best) break;
        translateLinkAwayFromWall(bodyA, bodyB, best.normalX, best.normalY, best.overlap, pinnedA, pinnedB);
        wakeKineticBody(bodyA);
        wakeKineticBody(bodyB);
        spatialFrame.scheduleKineticActivation(bodyA);
        spatialFrame.scheduleKineticActivation(bodyB);
    }
}
export function projectIslandLinkCapsulesAgainstWalls(spatialFrame, buffer, groups) {
    const walls = [];
    for (let g = 0; g < groups.count; g++) {
        const start = groups.starts[g];
        const count = groups.counts[g];
        if (islandConstraintsAsleep(buffer, start, count)) continue;
        for (let i = start; i < start + count; i++) {
            const bodyA = buffer.bodyA[i];
            const bodyB = buffer.bodyB[i];
            gatherLinkWallCandidates(spatialFrame, bodyA, bodyB, walls);
            projectDistanceLinkCapsuleAgainstWalls(bodyA, bodyB, buffer.anchorAx[i], buffer.anchorAy[i], buffer.anchorBx[i], buffer.anchorBy[i], walls, spatialFrame);
        }
    }
}
function projectDistanceConstraint(buffer, index) {
    const bodyA = buffer.bodyA[index];
    const bodyB = buffer.bodyB[index];
    const wa = worldAnchorFromBody(bodyA, buffer.anchorAx[index], buffer.anchorAy[index]);
    const wb = worldAnchorFromBody(bodyB, buffer.anchorBx[index], buffer.anchorBy[index]);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - buffer.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormal(bodyA, bodyB, nx, ny, -error, massFromBody(bodyA), massFromBody(bodyB), bodyPinnedForContact(bodyA), bodyPinnedForContact(bodyB));
}
function solveDistanceConstraintVelocity(buffer, index, spatialFrame) {
    const bodyA = buffer.bodyA[index];
    const bodyB = buffer.bodyB[index];
    const wa = worldAnchorFromBody(bodyA, buffer.anchorAx[index], buffer.anchorAy[index]);
    const wb = worldAnchorFromBody(bodyB, buffer.anchorBx[index], buffer.anchorBy[index]);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return 0;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - buffer.restLength[index];
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
    if (k <= 1e-12) return 0;
    const vAx = (bodyA.vx ?? 0) - (bodyA.angularVelocity ?? 0) * ray;
    const vAy = (bodyA.vy ?? 0) + (bodyA.angularVelocity ?? 0) * rax;
    const vBx = (bodyB.vx ?? 0) - (bodyB.angularVelocity ?? 0) * rby;
    const vBy = (bodyB.vy ?? 0) + (bodyB.angularVelocity ?? 0) * rbx;
    const vRelN = (vBx - vAx) * nx + (vBy - vAy) * ny;
    const bias = getCollisionSettings().kineticConstraints.velocityBias;
    const lambda = -(vRelN + bias * error) / k;
    if (lambda === 0) return 0;
    bodyA.vx = (bodyA.vx ?? 0) - lambda * nx * invMassA;
    bodyA.vy = (bodyA.vy ?? 0) - lambda * ny * invMassA;
    bodyB.vx = (bodyB.vx ?? 0) + lambda * nx * invMassB;
    bodyB.vy = (bodyB.vy ?? 0) + lambda * ny * invMassB;
    bodyA.angularVelocity = (bodyA.angularVelocity ?? 0) - lambda * rAn * invIA;
    bodyB.angularVelocity = (bodyB.angularVelocity ?? 0) + lambda * rBn * invIB;
    spatialFrame.scheduleKineticActivation(bodyA);
    spatialFrame.scheduleKineticActivation(bodyB);
    return Math.abs(lambda);
}
export function projectKineticConstraintBuffer(buffer, groups) {
    for (let g = 0; g < groups.count; g++) {
        const start = groups.starts[g];
        const count = groups.counts[g];
        if (islandConstraintsAsleep(buffer, start, count)) continue;
        for (let i = start; i < start + count; i++) projectDistanceConstraint(buffer, i);
    }
}
export function solveKineticConstraintBuffer(spatialFrame, buffer, groups) {
    if (buffer.count === 0) return;
    const iterations = getCollisionSettings().kineticConstraints.iterations;
    const earlyOut = getCollisionSettings().kineticEarlyOut;
    for (let iter = 0; iter < iterations; iter++) {
        let maxImpulse = 0;
        for (let g = 0; g < groups.count; g++) {
            const start = groups.starts[g];
            const count = groups.counts[g];
            if (islandConstraintsAsleep(buffer, start, count)) continue;
            for (let i = start; i < start + count; i++) {
                const impulse = solveDistanceConstraintVelocity(buffer, i, spatialFrame);
                if (impulse > maxImpulse) maxImpulse = impulse;
            }
        }
        if (earlyOut.enabled && iter + 1 >= earlyOut.contactMinIterations && maxImpulse <= earlyOut.contactImpulseEpsilon) break;
    }
}
export function resolveKineticConstraintPass(tick) {
    const { buffer, groups } = gatherKineticConstraintBuffer(tick);
    projectKineticConstraintBuffer(buffer, groups);
    solveKineticConstraintBuffer(tick.frame, buffer, groups);
}
export function measureConstraintBufferMaxError(buffer) {
    let max = 0;
    for (let i = 0; i < buffer.count; i++) {
        const bodyA = buffer.bodyA[i];
        const bodyB = buffer.bodyB[i];
        const wa = worldAnchorFromBody(bodyA, buffer.anchorAx[i], buffer.anchorAy[i]);
        const wb = worldAnchorFromBody(bodyB, buffer.anchorBx[i], buffer.anchorBy[i]);
        const error = Math.abs(Math.hypot(wb.x - wa.x, wb.y - wa.y) - buffer.restLength[i]);
        if (error > max) max = error;
    }
    return max;
}
export function measureDistanceConstraintError(registry, constraint) {
    const bodyA = registry.getLive(constraint.bodyAId);
    const bodyB = registry.getLive(constraint.bodyBId);
    if (!bodyA || !bodyB) return Infinity;
    return Math.abs(distanceBetweenAnchors(bodyA, constraint.anchorA, bodyB, constraint.anchorB) - constraint.restLength);
}
