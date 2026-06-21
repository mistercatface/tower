import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "./bodyMass.js";
import { worldAnchorFromBody } from "./constraintAnchors.js";
import { getLinkCapsuleSegmentPenetration } from "../Spatial/geometry/WallGeometry.js";
import { getEntityCollisionParts } from "../Spatial/collision/SatCollision.js";
import { separateAlongNormal, applyPositionCorrection } from "../Spatial/collision/penetration.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { wakeKineticBody } from "./kineticSleep.js";
const LINK_CAPSULE_WALL_PASSES = 2;
/** Reused per-island wall candidate list — cleared at the start of each awake island. */
const islandLinkWallCandidates = [];
/** Segment identity set paired with islandLinkWallCandidates for O(1) dedup during gather. */
const islandLinkWallSegmentSet = new Set();
/** Per-link AABB filter into the current island list before narrow-phase wall tests. */
const linkFilteredWallCandidates = [];
const MAX_KINETIC_CONSTRAINTS = 2048;
const MAX_ISLAND_GROUPS = 256;
const CONSTRAINT_EDGE_KEY_SCALE = 1_000_000;
export const kineticConstraintSlab = {
    count: 0,
    groupCount: 0,
    groupCounts: new Int32Array(MAX_ISLAND_GROUPS),
    bodyA: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyB: new Array(MAX_KINETIC_CONSTRAINTS),
    anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    massA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    massB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    invMassA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    invMassB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    invIA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    invIB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    pinnedA: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
    pinnedB: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
    capsuleRadius: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    nx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    ny: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    rAn: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    rBn: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    k: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    error: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    islandAsleep: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
    entry: new Array(MAX_KINETIC_CONSTRAINTS),
    reset() {
        this.count = 0;
        this.groupCount = 0;
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
function circleRadiusFromBody(body) {
    const parts = getEntityCollisionParts(body);
    for (let i = 0; i < parts.length; i++) if (parts[i].type === "Circle") return parts[i].radius;
    return body.radius;
}
function linkCapsuleRadius(bodyA, bodyB) {
    return Math.max(circleRadiusFromBody(bodyA), circleRadiusFromBody(bodyB));
}
function appendConstraintEntry(slab, item) {
    const idx = slab.count++;
    const bodyA = item.bodyA;
    const bodyB = item.bodyB;
    slab.bodyA[idx] = bodyA;
    slab.bodyB[idx] = bodyB;
    slab.anchorAx[idx] = item.entry.anchorA.x;
    slab.anchorAy[idx] = item.entry.anchorA.y;
    slab.anchorBx[idx] = item.entry.anchorB.x;
    slab.anchorBy[idx] = item.entry.anchorB.y;
    slab.restLength[idx] = item.entry.restLength;
    slab.massA[idx] = massFromBody(bodyA);
    slab.massB[idx] = massFromBody(bodyB);
    slab.invMassA[idx] = inverseMassFromBody(bodyA);
    slab.invMassB[idx] = inverseMassFromBody(bodyB);
    slab.invIA[idx] = bodyA.momentOfInertia ? 1 / bodyA.momentOfInertia : 0;
    slab.invIB[idx] = bodyB.momentOfInertia ? 1 / bodyB.momentOfInertia : 0;
    slab.pinnedA[idx] = bodyPinnedForContact(bodyA) ? 1 : 0;
    slab.pinnedB[idx] = bodyPinnedForContact(bodyB) ? 1 : 0;
    slab.capsuleRadius[idx] = linkCapsuleRadius(bodyA, bodyB);
    slab.accumulatedImpulse[idx] = item.entry.accumulatedImpulse || 0;
    slab.entry[idx] = item.entry;
}
function islandConstraintsAsleep(slab, start, count) {
    for (let i = start; i < start + count; i++) {
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        if (!bodyA.isSleeping || !bodyB.isSleeping) return false;
    }
    return count > 0;
}
function forEachConstraintIsland(slab, fn) {
    // (Unused now that we flattened the loops, but left in case other systems need it)
    let start = 0;
    for (let g = 0; g < slab.groupCount; g++) {
        const count = slab.groupCounts[g];
        fn(start, count);
        start += count;
    }
}
export function gatherKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    slab.reset();
    const { frame, world } = tick;
    const session = world.kinetic;
    const plan = ensureKineticIslandPlan(session, frame._kineticBodies);
    const list = session.kineticConstraints;
    const buckets = new Map();
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        const bodyA = entry.bodyA;
        const bodyB = entry.bodyB;
        if (bodyA.isDead || bodyB.isDead) continue;
        if (!bodyA.strategy?.isKinetic || !bodyB.strategy?.isKinetic) continue;
        const root = plan.bodyIdToIslandRoot.get(bodyA.id) ?? bodyA.id;
        if (!buckets.has(root)) buckets.set(root, []);
        buckets.get(root).push({ entry, bodyA, bodyB });
    }
    for (const items of buckets.values()) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        const ordered = orderIslandConstraintItems(items);
        const groupStart = slab.count;
        let asleep = true;
        for (let i = 0; i < ordered.length; i++)
            if (!ordered[i].bodyA.isSleeping || !ordered[i].bodyB.isSleeping) {
                asleep = false;
                break;
            }
        for (let i = 0; i < ordered.length; i++) {
            if (slab.count >= MAX_KINETIC_CONSTRAINTS) break;
            appendConstraintEntry(slab, ordered[i]);
            slab.islandAsleep[slab.count - 1] = asleep ? 1 : 0;
        }
        const count = slab.count - groupStart;
        if (count === 0) continue;
        slab.groupCounts[slab.groupCount] = count;
        slab.groupCount++;
    }
}
function linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, segment) {
    const reach = capsuleRadius + segment.size * 0.75;
    const minX = Math.min(ax, bx) - reach;
    const maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach;
    const maxY = Math.max(ay, by) + reach;
    return segment.x >= minX && segment.x <= maxX && segment.y >= minY && segment.y <= maxY;
}
function mergeWallCandidatesInto(candidates, out) {
    for (let i = 0; i < candidates.length; i++) {
        const seg = candidates[i];
        if (islandLinkWallSegmentSet.has(seg)) continue;
        islandLinkWallSegmentSet.add(seg);
        out.push(seg);
    }
}
function appendBodyWallCandidates(spatialFrame, body, gatherMark, out) {
    if (body._linkWallGatherMark === gatherMark) return;
    body._linkWallGatherMark = gatherMark;
    mergeWallCandidatesInto(spatialFrame.getWallCandidates(body), out);
}
function gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, out) {
    out.length = 0;
    islandLinkWallSegmentSet.clear();
    for (let i = start; i < start + count; i++) {
        appendBodyWallCandidates(spatialFrame, slab.bodyA[i], gatherMark, out);
        appendBodyWallCandidates(spatialFrame, slab.bodyB[i], gatherMark, out);
    }
}
function collectLinkOverlappingWalls(ax, ay, bx, by, capsuleRadius, walls, out) {
    out.length = 0;
    for (let i = 0; i < walls.length; i++) {
        const seg = walls[i];
        if (seg.passageEdge) continue;
        if (linkSegmentOverlapsWall(ax, ay, bx, by, capsuleRadius, seg)) out.push(seg);
    }
}
function shouldProjectLinkCapsuleAgainstWalls(bodyA, bodyB, anchorAx, anchorAy, anchorBx, anchorBy, capsuleRadius, islandWalls, linkWallsOut) {
    if (bodyA.isSleeping && bodyB.isSleeping) {
        linkWallsOut.length = 0;
        return false;
    }
    const wa = worldAnchorFromBody(bodyA, anchorAx, anchorAy);
    const wb = worldAnchorFromBody(bodyB, anchorBx, anchorBy);
    collectLinkOverlappingWalls(wa.x, wa.y, wb.x, wb.y, capsuleRadius, islandWalls, linkWallsOut);
    return linkWallsOut.length > 0;
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
function projectDistanceLinkCapsuleAgainstWalls(bodyA, bodyB, anchorAx, anchorAy, anchorBx, anchorBy, linkWalls, spatialFrame, pinnedA, pinnedB, capsuleRadius) {
    if (!linkWalls.length) return;
    const approachX = ((bodyA.vx ?? 0) + (bodyB.vx ?? 0)) * 0.5;
    const approachY = ((bodyA.vy ?? 0) + (bodyB.vy ?? 0)) * 0.5;
    for (let pass = 0; pass < LINK_CAPSULE_WALL_PASSES; pass++) {
        const wa = worldAnchorFromBody(bodyA, anchorAx, anchorAy);
        const wb = worldAnchorFromBody(bodyB, anchorBx, anchorBy);
        let best = null;
        for (let i = 0; i < linkWalls.length; i++) {
            const seg = linkWalls[i];
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
function projectIslandLinkCapsulesAgainstWalls(tick) {
    const slab = kineticConstraintSlab;
    const spatialFrame = tick.frame;
    const islandWalls = islandLinkWallCandidates;
    const linkWalls = linkFilteredWallCandidates;
    const gatherMark = spatialFrame.frameId;
    let currentGroupStart = 0;
    for (let g = 0; g < slab.groupCount; g++) {
        const count = slab.groupCounts[g];
        const start = currentGroupStart;
        currentGroupStart += count;
        if (slab.islandAsleep[start]) continue;
        gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, islandWalls);
        if (!islandWalls.length) continue;
        for (let i = start; i < start + count; i++) {
            const bodyA = slab.bodyA[i];
            const bodyB = slab.bodyB[i];
            if (!shouldProjectLinkCapsuleAgainstWalls(bodyA, bodyB, slab.anchorAx[i], slab.anchorAy[i], slab.anchorBx[i], slab.anchorBy[i], slab.capsuleRadius[i], islandWalls, linkWalls)) continue;
            projectDistanceLinkCapsuleAgainstWalls(
                bodyA,
                bodyB,
                slab.anchorAx[i],
                slab.anchorAy[i],
                slab.anchorBx[i],
                slab.anchorBy[i],
                linkWalls,
                spatialFrame,
                slab.pinnedA[i],
                slab.pinnedB[i],
                slab.capsuleRadius[i],
            );
        }
    }
}
function projectDistanceConstraint(slab, index) {
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const wa = worldAnchorFromBody(bodyA, slab.anchorAx[index], slab.anchorAy[index]);
    const wb = worldAnchorFromBody(bodyB, slab.anchorBx[index], slab.anchorBy[index]);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - slab.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormal(bodyA, bodyB, nx, ny, -error, slab.massA[index], slab.massB[index], slab.pinnedA[index], slab.pinnedB[index]);
}
function solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.k[index];
    if (k <= 1e-12) return 0;
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const nx = slab.nx[index];
    const ny = slab.ny[index];
    const rAn = slab.rAn[index];
    const rBn = slab.rBn[index];
    const error = slab.error[index];
    const vAn = (bodyA.vx ?? 0) * nx + (bodyA.vy ?? 0) * ny + (bodyA.angularVelocity ?? 0) * rAn;
    const vBn = (bodyB.vx ?? 0) * nx + (bodyB.vy ?? 0) * ny + (bodyB.angularVelocity ?? 0) * rBn;
    const vRelN = vBn - vAn;
    const lambda = -(vRelN + velocityBias * error) / k;
    if (lambda === 0) return 0;
    slab.accumulatedImpulse[index] += lambda;
    const invMassA = slab.invMassA[index];
    const invMassB = slab.invMassB[index];
    const invIA = slab.invIA[index];
    const invIB = slab.invIB[index];
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
function projectKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    for (let i = 0; i < slab.count; i++) if (!slab.islandAsleep[i]) projectDistanceConstraint(slab, i);
}
function warmStartKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    for (let i = 0; i < slab.count; i++) {
        if (slab.islandAsleep[i]) continue;
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        const wa = worldAnchorFromBody(bodyA, slab.anchorAx[i], slab.anchorAy[i]);
        const wb = worldAnchorFromBody(bodyB, slab.anchorBx[i], slab.anchorBy[i]);
        const dx = wb.x - wa.x;
        const dy = wb.y - wa.y;
        const dist = Math.hypot(dx, dy);
        let nx = 0,
            ny = 0,
            error = 0,
            rAn = 0,
            rBn = 0,
            k = 0;
        if (dist >= 1e-8) {
            nx = dx / dist;
            ny = dy / dist;
            error = dist - slab.restLength[i];
            const invMassA = slab.invMassA[i];
            const invMassB = slab.invMassB[i];
            const invIA = slab.invIA[i];
            const invIB = slab.invIB[i];
            const rax = wa.x - bodyA.x;
            const ray = wa.y - bodyA.y;
            const rbx = wb.x - bodyB.x;
            const rby = wb.y - bodyB.y;
            rAn = rax * ny - ray * nx;
            rBn = rbx * ny - rby * nx;
            k = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
        }
        slab.nx[i] = nx;
        slab.ny[i] = ny;
        slab.error[i] = error;
        slab.rAn[i] = rAn;
        slab.rBn[i] = rBn;
        slab.k[i] = k;
        const lambda = slab.accumulatedImpulse[i];
        if (lambda !== 0 && dist >= 1e-8) {
            const invMassA = slab.invMassA[i];
            const invMassB = slab.invMassB[i];
            const invIA = slab.invIA[i];
            const invIB = slab.invIB[i];
            bodyA.vx = (bodyA.vx ?? 0) - lambda * nx * invMassA;
            bodyA.vy = (bodyA.vy ?? 0) - lambda * ny * invMassA;
            bodyB.vx = (bodyB.vx ?? 0) + lambda * nx * invMassB;
            bodyB.vy = (bodyB.vy ?? 0) + lambda * ny * invMassB;
            bodyA.angularVelocity = (bodyA.angularVelocity ?? 0) - lambda * rAn * invIA;
            bodyB.angularVelocity = (bodyB.angularVelocity ?? 0) + lambda * rBn * invIB;
        }
    }
}
function solveKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    if (slab.count === 0) return;
    const spatialFrame = tick.frame;
    const constraintSettings = getCollisionSettings().kineticConstraints;
    const { contactImpulseEpsilon } = getCollisionSettings().kineticEarlyOut;
    warmStartKineticConstraintSlab();
    for (let iter = 0; iter < constraintSettings.iterations; iter++) {
        let maxImpulse = 0;
        for (let i = 0; i < slab.count; i++) {
            if (slab.islandAsleep[i]) continue;
            const impulse = solveDistanceConstraintVelocity(slab, i, spatialFrame, constraintSettings.velocityBias);
            if (impulse > maxImpulse) maxImpulse = impulse;
        }
        if (maxImpulse <= contactImpulseEpsilon) break;
    }
    for (let i = 0; i < slab.count; i++) slab.entry[i].accumulatedImpulse = slab.accumulatedImpulse[i];
}
export function resolveGatheredKineticConstraintSlab(tick) {
    projectKineticConstraintSlab();
    projectIslandLinkCapsulesAgainstWalls(tick);
    solveKineticConstraintSlab(tick);
}
export function measureConstraintSlabMaxError() {
    const slab = kineticConstraintSlab;
    let max = 0;
    for (let i = 0; i < slab.count; i++) {
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        const wa = worldAnchorFromBody(bodyA, slab.anchorAx[i], slab.anchorAy[i]);
        const wb = worldAnchorFromBody(bodyB, slab.anchorBx[i], slab.anchorBy[i]);
        const error = Math.abs(Math.hypot(wb.x - wa.x, wb.y - wa.y) - slab.restLength[i]);
        if (error > max) max = error;
    }
    return max;
}
