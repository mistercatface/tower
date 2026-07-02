import { collisionSettings } from "../Collision/collisionDefaults.js";
import { bodyPinnedForContact, inverseMassFromBody, massFromBody } from "./bodyMass.js";
import { worldAnchorFromBody, worldAnchorFromSlab } from "./constraintAnchors.js";
import { getLinkCapsuleSegmentPenetration } from "../Spatial/geometry/WallGeometry.js";
import { getEntityCollisionParts } from "../Spatial/collision/SatCollision.js";
import { applyPositionCorrection } from "../Spatial/collision/penetration.js";
import { ensureKineticIslandPlan } from "./kineticIslands.js";
import { wakeKineticBody } from "./kineticSleep.js";
import { kineticDynamicSlab, kineticStaticSlab, writeActiveKineticBodySlabPose, writebackKineticBodySlabPhysIds, separateAlongNormalSlab } from "../Spatial/collision/kineticBodySlab.js";
import { normalizeAngle } from "../Math/Angle.js";
import { invalidateBroadphaseBounds } from "../Spatial/collision/entityBroadphase.js";
const LINK_CAPSULE_WALL_PASSES = 4;
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
    activeCount: 0,
    groupCount: 0,
    groupCounts: new Int32Array(MAX_ISLAND_GROUPS),
    type: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyA: new Array(MAX_KINETIC_CONSTRAINTS),
    bodyB: new Array(MAX_KINETIC_CONSTRAINTS),
    physIdA: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    physIdB: new Int32Array(MAX_KINETIC_CONSTRAINTS),
    dynamic: {
        accumulatedImpulse: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        nx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        ny: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        rAn: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        rBn: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        k: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        error: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    },
    static: {
        anchorAx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        anchorAy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        anchorBx: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        anchorBy: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        restLength: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        referenceAngle: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        massA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        massB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        invMassA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        invMassB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        invIA: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        invIB: new Float32Array(MAX_KINETIC_CONSTRAINTS),
        pinnedA: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
        pinnedB: new Uint8Array(MAX_KINETIC_CONSTRAINTS),
        capsuleRadius: new Float32Array(MAX_KINETIC_CONSTRAINTS),
    },
    entry: new Array(MAX_KINETIC_CONSTRAINTS),
    reset() {
        this.count = 0;
        this.activeCount = 0;
        this.groupCount = 0;
    },
};
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
const constraintPhysSyncSeen = new Set();
const constraintBridgePhysIds = [];
const orderBodyByPhysId = new Array(MAX_PHYS_BODIES);
const orderSeenPhysIds = new Uint8Array(MAX_PHYS_BODIES);
const orderUniquePhysIds = [];
const orderUsedItems = new Uint8Array(MAX_KINETIC_CONSTRAINTS);
const orderOrdered = [];
const bucketRoots = new Int32Array(MAX_ISLAND_GROUPS);
const gatherBuckets = new Array(MAX_ISLAND_GROUPS);
const awakeGroups = [];
const asleepGroups = [];
const bucketPool = [];
let bucketPoolUseCount = 0;
function getPoolArray() {
    if (bucketPoolUseCount >= bucketPool.length) bucketPool.push([]);
    const arr = bucketPool[bucketPoolUseCount++];
    arr.length = 0;
    return arr;
}
const itemPool = [];
let itemPoolUseCount = 0;
function getPoolItem() {
    if (itemPoolUseCount >= itemPool.length) itemPool.push({ entry: null, bodyA: null, bodyB: null });
    return itemPool[itemPoolUseCount++];
}
const anchorAWorld = { x: 0, y: 0 };
const anchorBWorld = { x: 0, y: 0 };
function orderIslandConstraintItems(items) {
    if (items.length <= 1) return items;
    orderUniquePhysIds.length = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const physA = item.bodyA._physId;
        const physB = item.bodyB._physId;
        if (physA !== undefined && physA !== -1 && orderSeenPhysIds[physA] === 0) {
            orderSeenPhysIds[physA] = 1;
            orderUniquePhysIds.push(physA);
            orderBodyByPhysId[physA] = item.bodyA;
        }
        if (physB !== undefined && physB !== -1 && orderSeenPhysIds[physB] === 0) {
            orderSeenPhysIds[physB] = 1;
            orderUniquePhysIds.push(physB);
            orderBodyByPhysId[physB] = item.bodyB;
        }
    }
    let startId = null;
    let startPhysId = null;
    for (let i = 0; i < orderUniquePhysIds.length; i++) {
        const physId = orderUniquePhysIds[i];
        const body = orderBodyByPhysId[physId];
        const neighbors = body._kineticLinkNeighbors;
        let inIslandCount = 0;
        if (neighbors)
            for (let j = 0; j < neighbors.length; j++) {
                const neighborPhys = neighbors[j]._physId;
                if (neighborPhys !== undefined && neighborPhys !== -1 && orderSeenPhysIds[neighborPhys] === 1) inIslandCount++;
            }
        if (inIslandCount <= 1) {
            startPhysId = physId;
            startId = body.id;
            break;
        }
    }
    if (startId == null) {
        let minId = Infinity;
        for (let i = 0; i < orderUniquePhysIds.length; i++) {
            const physId = orderUniquePhysIds[i];
            const body = orderBodyByPhysId[physId];
            if (body.id < minId) {
                minId = body.id;
                startPhysId = physId;
                startId = body.id;
            }
        }
    }
    orderOrdered.length = 0;
    orderUsedItems.fill(0, 0, items.length);
    let currentPhysId = startPhysId;
    while (orderOrdered.length < items.length) {
        const body = orderBodyByPhysId[currentPhysId];
        const neighbors = body._kineticLinkNeighbors ?? [];
        let advanced = false;
        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i];
            const neighborPhys = neighbor._physId;
            if (neighborPhys === undefined || neighborPhys === -1 || orderSeenPhysIds[neighborPhys] === 0) continue;
            let itemIdx = -1;
            for (let k = 0; k < items.length; k++) {
                if (orderUsedItems[k] === 1) continue;
                const item = items[k];
                const physA = item.bodyA._physId;
                const physB = item.bodyB._physId;
                if ((physA === currentPhysId && physB === neighborPhys) || (physA === neighborPhys && physB === currentPhysId)) {
                    itemIdx = k;
                    break;
                }
            }
            if (itemIdx === -1) continue;
            orderOrdered.push(items[itemIdx]);
            orderUsedItems[itemIdx] = 1;
            currentPhysId = neighborPhys;
            advanced = true;
            break;
        }
        if (!advanced) break;
    }
    for (let i = 0; i < items.length; i++) if (orderUsedItems[i] === 0) orderOrdered.push(items[i]);
    for (let i = 0; i < orderUniquePhysIds.length; i++) {
        const physId = orderUniquePhysIds[i];
        orderBodyByPhysId[physId] = undefined;
        orderSeenPhysIds[physId] = 0;
    }
    return orderOrdered;
}
function circleRadiusFromBody(body) {
    const parts = getEntityCollisionParts(body);
    for (let i = 0; i < parts.length; i++) if (parts[i].type === "Circle") return parts[i].radius;
    return body.radius;
}
function linkCapsuleRadius(bodyA, bodyB) {
    return Math.max(circleRadiusFromBody(bodyA), circleRadiusFromBody(bodyB)) + 0.05;
}
function appendConstraintEntry(slab, item) {
    const idx = slab.count++;
    const bodyA = item.bodyA;
    const bodyB = item.bodyB;
    slab.type[idx] = item.entry.type ?? "distance";
    slab.bodyA[idx] = bodyA;
    slab.bodyB[idx] = bodyB;
    slab.physIdA[idx] = bodyA._physId;
    slab.physIdB[idx] = bodyB._physId;
    if (slab.type[idx] === "angle") {
        slab.static.referenceAngle[idx] = item.entry.referenceAngle ?? 0;
        slab.static.anchorAx[idx] = 0;
        slab.static.anchorAy[idx] = 0;
        slab.static.anchorBx[idx] = 0;
        slab.static.anchorBy[idx] = 0;
        slab.static.restLength[idx] = 0;
        slab.static.capsuleRadius[idx] = 0;
    } else {
        slab.static.referenceAngle[idx] = 0;
        slab.static.anchorAx[idx] = item.entry.anchorA?.x ?? 0;
        slab.static.anchorAy[idx] = item.entry.anchorA?.y ?? 0;
        slab.static.anchorBx[idx] = item.entry.anchorB?.x ?? 0;
        slab.static.anchorBy[idx] = item.entry.anchorB?.y ?? 0;
        slab.static.restLength[idx] = item.entry.restLength ?? 0;
        slab.static.capsuleRadius[idx] = linkCapsuleRadius(bodyA, bodyB);
    }
    slab.static.massA[idx] = massFromBody(bodyA);
    slab.static.massB[idx] = massFromBody(bodyB);
    slab.static.invMassA[idx] = inverseMassFromBody(bodyA);
    slab.static.invMassB[idx] = inverseMassFromBody(bodyB);
    slab.static.invIA[idx] = bodyA.momentOfInertia ? 1 / bodyA.momentOfInertia : 0;
    slab.static.invIB[idx] = bodyB.momentOfInertia ? 1 / bodyB.momentOfInertia : 0;
    slab.static.pinnedA[idx] = bodyPinnedForContact(bodyA) ? 1 : 0;
    slab.static.pinnedB[idx] = bodyPinnedForContact(bodyB) ? 1 : 0;
    slab.dynamic.accumulatedImpulse[idx] = item.entry.accumulatedImpulse || 0;
    slab.entry[idx] = item.entry;
}
function islandItemsAsleep(items) {
    for (let i = 0; i < items.length; i++) {
        const { bodyA, bodyB } = items[i];
        if (!bodyA.isSleeping || !bodyB.isSleeping) return false;
    }
    return items.length > 0;
}
function appendIslandConstraintGroup(slab, ordered) {
    const groupStart = slab.count;
    for (let i = 0; i < ordered.length; i++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS) break;
        appendConstraintEntry(slab, ordered[i]);
    }
    const count = slab.count - groupStart;
    if (count === 0) return;
    slab.groupCounts[slab.groupCount] = count;
    slab.groupCount++;
}
function syncConstraintSlabBodies(slab) {
    constraintPhysSyncSeen.clear();
    for (let i = 0; i < slab.count; i++) {
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        if (!constraintPhysSyncSeen.has(physIdA)) {
            constraintPhysSyncSeen.add(physIdA);
            writeActiveKineticBodySlabPose(slab.bodyA[i]);
        }
        if (!constraintPhysSyncSeen.has(physIdB)) {
            constraintPhysSyncSeen.add(physIdB);
            writeActiveKineticBodySlabPose(slab.bodyB[i]);
        }
    }
}
function collectActiveConstraintPhysIds(slab, out) {
    constraintPhysSyncSeen.clear();
    out.length = 0;
    for (let i = 0; i < slab.activeCount; i++) {
        const physIdA = slab.physIdA[i];
        const physIdB = slab.physIdB[i];
        if (!constraintPhysSyncSeen.has(physIdA)) {
            constraintPhysSyncSeen.add(physIdA);
            out.push(physIdA);
        }
        if (!constraintPhysSyncSeen.has(physIdB)) {
            constraintPhysSyncSeen.add(physIdB);
            out.push(physIdB);
        }
    }
}
export function gatherKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    slab.reset();
    const { frame, world } = tick;
    const session = world.kinetic;
    const plan = ensureKineticIslandPlan(session, frame._kineticBodies);
    const list = session.kineticConstraints;
    bucketPoolUseCount = 0;
    itemPoolUseCount = 0;
    let bucketCount = 0;
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance" && entry.type !== "angle") continue;
        const bodyA = entry.bodyA;
        const bodyB = entry.bodyB;
        if (bodyA.isDead || bodyB.isDead) continue;
        if (!bodyA.strategy?.isKinetic || !bodyB.strategy?.isKinetic) continue;
        const root = plan.bodyIdToIslandRoot.get(bodyA.id) ?? bodyA.id;
        let bucketIdx = -1;
        for (let j = 0; j < bucketCount; j++)
            if (bucketRoots[j] === root) {
                bucketIdx = j;
                break;
            }
        if (bucketIdx === -1)
            if (bucketCount < MAX_ISLAND_GROUPS) {
                bucketIdx = bucketCount;
                bucketRoots[bucketCount] = root;
                bucketCount++;
                gatherBuckets[bucketIdx] = getPoolArray();
            }
        if (bucketIdx !== -1) {
            const item = getPoolItem();
            item.entry = entry;
            item.bodyA = bodyA;
            item.bodyB = bodyB;
            gatherBuckets[bucketIdx].push(item);
        }
    }
    awakeGroups.length = 0;
    asleepGroups.length = 0;
    for (let i = 0; i < bucketCount; i++) {
        const items = gatherBuckets[i];
        const ordered = orderIslandConstraintItems(items);
        if (islandItemsAsleep(ordered)) {
            const groupCopy = getPoolArray();
            for (let j = 0; j < ordered.length; j++) groupCopy.push(ordered[j]);
            asleepGroups.push(groupCopy);
        } else {
            const groupCopy = getPoolArray();
            for (let j = 0; j < ordered.length; j++) groupCopy.push(ordered[j]);
            awakeGroups.push(groupCopy);
        }
    }
    for (let g = 0; g < awakeGroups.length; g++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        appendIslandConstraintGroup(slab, awakeGroups[g]);
    }
    slab.activeCount = slab.count;
    for (let g = 0; g < asleepGroups.length; g++) {
        if (slab.count >= MAX_KINETIC_CONSTRAINTS || slab.groupCount >= MAX_ISLAND_GROUPS) break;
        appendIslandConstraintGroup(slab, asleepGroups[g]);
    }
    syncConstraintSlabBodies(slab);
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
    const wa = worldAnchorFromBody(bodyA, anchorAx, anchorAy, anchorAWorld);
    const wb = worldAnchorFromBody(bodyB, anchorBx, anchorBy, anchorBWorld);
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
        const wa = worldAnchorFromBody(bodyA, anchorAx, anchorAy, anchorAWorld);
        const wb = worldAnchorFromBody(bodyB, anchorBx, anchorBy, anchorBWorld);
        let best = null;
        for (let i = 0; i < linkWalls.length; i++) {
            const seg = linkWalls[i];
            if (!linkSegmentOverlapsWall(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg)) continue;
            const penetration = getLinkCapsuleSegmentPenetration(wa.x, wa.y, wb.x, wb.y, capsuleRadius, seg, { approachX, approachY });
            if (!penetration || penetration.overlap <= 0) continue;
            if (!best || penetration.overlap > best.overlap) best = { ...penetration, segment: seg };
        }
        if (!best) break;
        const approachDot = approachX * best.normalX + approachY * best.normalY;
        const hit = { approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, isLinkCapsule: true };
        if (!bodyA._wallResolveHits) bodyA._wallResolveHits = [];
        if (!bodyB._wallResolveHits) bodyB._wallResolveHits = [];
        bodyA._wallResolveHits.push(hit);
        bodyB._wallResolveHits.push(hit);
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
    for (let i = 0; i < slab.activeCount; i++) {
        if (slab.bodyA[i]) slab.bodyA[i]._wallResolveHits = null;
        if (slab.bodyB[i]) slab.bodyB[i]._wallResolveHits = null;
    }
    let currentGroupStart = 0;
    for (let g = 0; g < slab.groupCount; g++) {
        const count = slab.groupCounts[g];
        const start = currentGroupStart;
        currentGroupStart += count;
        if (start >= slab.activeCount) break;
        gatherIslandLinkWallCandidates(spatialFrame, slab, start, count, gatherMark, islandWalls);
        if (!islandWalls.length) continue;
        for (let pass = 0; pass < 2; pass++)
            for (let i = start; i < start + count; i++) {
                if (slab.type[i] === "angle") continue;
                const bodyA = slab.bodyA[i];
                const bodyB = slab.bodyB[i];
                if (
                    !shouldProjectLinkCapsuleAgainstWalls(
                        bodyA,
                        bodyB,
                        slab.static.anchorAx[i],
                        slab.static.anchorAy[i],
                        slab.static.anchorBx[i],
                        slab.static.anchorBy[i],
                        slab.static.capsuleRadius[i],
                        islandWalls,
                        linkWalls,
                    )
                )
                    continue;
                projectDistanceLinkCapsuleAgainstWalls(
                    bodyA,
                    bodyB,
                    slab.static.anchorAx[i],
                    slab.static.anchorAy[i],
                    slab.static.anchorBx[i],
                    slab.static.anchorBy[i],
                    linkWalls,
                    spatialFrame,
                    slab.static.pinnedA[i],
                    slab.static.pinnedB[i],
                    slab.static.capsuleRadius[i],
                );
            }
    }
}
function projectDistanceConstraint(slab, index) {
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const dynSlab = kineticDynamicSlab;
    const wa = worldAnchorFromSlab(slab.bodyA[index], physIdA, slab.static.anchorAx[index], slab.static.anchorAy[index], dynSlab, anchorAWorld);
    const wb = worldAnchorFromSlab(slab.bodyB[index], physIdB, slab.static.anchorBx[index], slab.static.anchorBy[index], dynSlab, anchorBWorld);
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const error = dist - slab.static.restLength[index];
    if (Math.abs(error) < 1e-5) return;
    separateAlongNormalSlab(physIdA, physIdB, nx, ny, -error);
}
function projectAngleConstraint(slab, index) {
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    if (bodyA.isSleeping && bodyB.isSleeping) return;
    const facingA = bodyA.facing ?? 0;
    const facingB = bodyB.facing ?? 0;
    const refAngle = slab.static.referenceAngle[index];
    const error = normalizeAngle(facingB - facingA - refAngle);
    if (Math.abs(error) < 1e-4) return;
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    const sum = invIA + invIB;
    if (sum <= 1e-12) return;
    const ratioA = invIA / sum;
    const ratioB = invIB / sum;
    const correctionA = error * ratioA;
    const correctionB = error * ratioB;
    bodyA.facing = normalizeAngle(facingA + correctionA);
    bodyB.facing = normalizeAngle(facingB - correctionB);
    bodyA.stateTimer = (bodyA.stateTimer ?? 0) + 1;
    bodyB.stateTimer = (bodyB.stateTimer ?? 0) + 1;
    invalidateBroadphaseBounds(bodyA);
    invalidateBroadphaseBounds(bodyB);
}
function projectConstraint(slab, index) {
    if (slab.type[index] === "angle") projectAngleConstraint(slab, index);
    else projectDistanceConstraint(slab, index);
}
function solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.dynamic.k[index];
    if (k <= 1e-12) return 0;
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const dynSlab = kineticDynamicSlab;
    const nx = slab.dynamic.nx[index];
    const ny = slab.dynamic.ny[index];
    const rAn = slab.dynamic.rAn[index];
    const rBn = slab.dynamic.rBn[index];
    const error = slab.dynamic.error[index];
    const vAn = dynSlab.vx[physIdA] * nx + dynSlab.vy[physIdA] * ny + dynSlab.w[physIdA] * rAn;
    const vBn = dynSlab.vx[physIdB] * nx + dynSlab.vy[physIdB] * ny + dynSlab.w[physIdB] * rBn;
    const vRelN = vBn - vAn;
    const lambda = -(vRelN + velocityBias * error) / k;
    if (lambda === 0) return 0;
    slab.dynamic.accumulatedImpulse[index] += lambda;
    const invMassA = slab.static.invMassA[index];
    const invMassB = slab.static.invMassB[index];
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    dynSlab.vx[physIdA] -= lambda * nx * invMassA;
    dynSlab.vy[physIdA] -= lambda * ny * invMassA;
    dynSlab.vx[physIdB] += lambda * nx * invMassB;
    dynSlab.vy[physIdB] += lambda * ny * invMassB;
    dynSlab.w[physIdA] -= lambda * rAn * invIA;
    dynSlab.w[physIdB] += lambda * rBn * invIB;
    spatialFrame.scheduleKineticActivation(bodyA);
    spatialFrame.scheduleKineticActivation(bodyB);
    return Math.abs(lambda);
}
function solveAngleConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    const k = slab.dynamic.k[index];
    if (k <= 1e-12) return 0;
    const bodyA = slab.bodyA[index];
    const bodyB = slab.bodyB[index];
    const physIdA = slab.physIdA[index];
    const physIdB = slab.physIdB[index];
    const dynSlab = kineticDynamicSlab;
    const error = slab.dynamic.error[index];
    const vRelN = dynSlab.w[physIdB] - dynSlab.w[physIdA];
    const lambda = -(vRelN + velocityBias * error) / k;
    if (lambda === 0) return 0;
    slab.dynamic.accumulatedImpulse[index] += lambda;
    const invIA = slab.static.invIA[index];
    const invIB = slab.static.invIB[index];
    dynSlab.w[physIdA] -= lambda * invIA;
    dynSlab.w[physIdB] += lambda * invIB;
    spatialFrame.scheduleKineticActivation(bodyA);
    spatialFrame.scheduleKineticActivation(bodyB);
    return Math.abs(lambda);
}
function solveConstraintVelocity(slab, index, spatialFrame, velocityBias) {
    if (slab.type[index] === "angle") return solveAngleConstraintVelocity(slab, index, spatialFrame, velocityBias);
    else return solveDistanceConstraintVelocity(slab, index, spatialFrame, velocityBias);
}
function projectKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    for (let i = 0; i < slab.activeCount; i += 2) projectConstraint(slab, i);
    for (let i = 1; i < slab.activeCount; i += 2) projectConstraint(slab, i);
}
function warmStartDistanceConstraint(slab, i, dynSlab) {
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const wa = worldAnchorFromSlab(bodyA, physIdA, slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
    const wb = worldAnchorFromSlab(bodyB, physIdB, slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
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
        error = dist - slab.static.restLength[i];
        const invMassA = slab.static.invMassA[i];
        const invMassB = slab.static.invMassB[i];
        const invIA = slab.static.invIA[i];
        const invIB = slab.static.invIB[i];
        const rax = wa.x - dynSlab.x[physIdA];
        const ray = wa.y - dynSlab.y[physIdA];
        const rbx = wb.x - dynSlab.x[physIdB];
        const rby = wb.y - dynSlab.y[physIdB];
        rAn = rax * ny - ray * nx;
        rBn = rbx * ny - rby * nx;
        k = invMassA + invMassB + rAn * rAn * invIA + rBn * rBn * invIB;
    }
    slab.dynamic.nx[i] = nx;
    slab.dynamic.ny[i] = ny;
    slab.dynamic.error[i] = error;
    slab.dynamic.rAn[i] = rAn;
    slab.dynamic.rBn[i] = rBn;
    slab.dynamic.k[i] = k;
    const lambda = slab.dynamic.accumulatedImpulse[i];
    if (lambda !== 0 && dist >= 1e-8) {
        const invMassA = slab.static.invMassA[i];
        const invMassB = slab.static.invMassB[i];
        const invIA = slab.static.invIA[i];
        const invIB = slab.static.invIB[i];
        dynSlab.vx[physIdA] -= lambda * nx * invMassA;
        dynSlab.vy[physIdA] -= lambda * ny * invMassA;
        dynSlab.vx[physIdB] += lambda * nx * invMassB;
        dynSlab.vy[physIdB] += lambda * ny * invMassB;
        dynSlab.w[physIdA] -= lambda * rAn * invIA;
        dynSlab.w[physIdB] += lambda * rBn * invIB;
    }
}
function warmStartAngleConstraint(slab, i, dynSlab) {
    const bodyA = slab.bodyA[i];
    const bodyB = slab.bodyB[i];
    const physIdA = slab.physIdA[i];
    const physIdB = slab.physIdB[i];
    const facingA = bodyA.facing ?? 0;
    const facingB = bodyB.facing ?? 0;
    const refAngle = slab.static.referenceAngle[i];
    const error = normalizeAngle(facingB - facingA - refAngle);
    const invIA = slab.static.invIA[i];
    const invIB = slab.static.invIB[i];
    const k = invIA + invIB;
    slab.dynamic.nx[i] = 0;
    slab.dynamic.ny[i] = 0;
    slab.dynamic.error[i] = error;
    slab.dynamic.rAn[i] = 1;
    slab.dynamic.rBn[i] = 1;
    slab.dynamic.k[i] = k;
    const lambda = slab.dynamic.accumulatedImpulse[i];
    if (lambda !== 0) {
        dynSlab.w[physIdA] -= lambda * invIA;
        dynSlab.w[physIdB] += lambda * invIB;
    }
}
function warmStartConstraint(slab, i, dynSlab) {
    if (slab.type[i] === "angle") warmStartAngleConstraint(slab, i, dynSlab);
    else warmStartDistanceConstraint(slab, i, dynSlab);
}
function warmStartKineticConstraintSlab() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    for (let i = 0; i < slab.activeCount; i++) warmStartConstraint(slab, i, dynSlab);
}
function solveKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    if (slab.activeCount === 0) return;
    const spatialFrame = tick.frame;
    const constraintSettings = collisionSettings.kineticConstraints;
    const { contactImpulseEpsilon } = collisionSettings.kineticEarlyOut;
    warmStartKineticConstraintSlab();
    for (let iter = 0; iter < constraintSettings.iterations; iter++) {
        let maxImpulse = 0;
        for (let i = 0; i < slab.activeCount; i += 2) {
            const impulse = solveConstraintVelocity(slab, i, spatialFrame, constraintSettings.velocityBias);
            if (impulse > maxImpulse) maxImpulse = impulse;
        }
        for (let i = 1; i < slab.activeCount; i += 2) {
            const impulse = solveConstraintVelocity(slab, i, spatialFrame, constraintSettings.velocityBias);
            if (impulse > maxImpulse) maxImpulse = impulse;
        }
        if (maxImpulse <= contactImpulseEpsilon) break;
    }
    for (let i = 0; i < slab.activeCount; i++) slab.entry[i].accumulatedImpulse = slab.dynamic.accumulatedImpulse[i];
}
function gatheredConstraintSlabHasEvictedBodies(spatialFrame, slab) {
    const entities = spatialFrame.entityGrid.entities;
    for (let i = 0; i < slab.activeCount; i++) {
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        if (bodyA._physId === undefined || bodyB._physId === undefined) return true;
        if (entities[slab.physIdA[i]] !== bodyA || entities[slab.physIdB[i]] !== bodyB) return true;
    }
    return false;
}
export function resolveGatheredKineticConstraintSlab(tick) {
    const slab = kineticConstraintSlab;
    if (slab.count === 0) return;
    if (gatheredConstraintSlabHasEvictedBodies(tick.frame, slab)) {
        gatherKineticConstraintSlab(tick);
        if (slab.count === 0) return;
    }
    projectKineticConstraintSlab();
    collectActiveConstraintPhysIds(slab, constraintBridgePhysIds);
    writebackKineticBodySlabPhysIds(tick.frame, constraintBridgePhysIds);
    projectIslandLinkCapsulesAgainstWalls(tick);
    solveKineticConstraintSlab(tick);
}
export function measureConstraintSlabMaxError() {
    const slab = kineticConstraintSlab;
    const dynSlab = kineticDynamicSlab;
    let max = 0;
    for (let i = 0; i < slab.activeCount; i++) {
        if (slab.type[i] === "angle") continue;
        const bodyA = slab.bodyA[i];
        const bodyB = slab.bodyB[i];
        const wa = worldAnchorFromSlab(bodyA, slab.physIdA[i], slab.static.anchorAx[i], slab.static.anchorAy[i], dynSlab, anchorAWorld);
        const wb = worldAnchorFromSlab(bodyB, slab.physIdB[i], slab.static.anchorBx[i], slab.static.anchorBy[i], dynSlab, anchorBWorld);
        const error = Math.abs(Math.hypot(wb.x - wa.x, wb.y - wa.y) - slab.static.restLength[i]);
        if (error > max) max = error;
    }
    return max;
}
