import { RAGDOLL_CONFIG, getScaledPhysics } from "./RagdollConfig.js";
import { processRagdollGoreHit } from "./RagdollGore.js";
import {
    PHYSICS_BONES,
    RAGDOLL_CONSTRAINT_EDGES,
    boneMapFromCharacterRig,
    characterRigFromBoneMap,
    resolvePhysicsBoneId,
} from "../KinematicsBones.js";

/** Frozen render depth at death — sim never writes this. */
export function getRagdollPointZ(ragdoll, key) {
    const depth = ragdoll.renderDepth?.[key];
    if (depth !== undefined) return depth.z ?? 0;
    const legacy = ragdoll.renderPoseBaseline?.[key];
    return legacy?.z ?? 0;
}

export function setRagdollPointZ(ragdoll, key, z) {
    if (!ragdoll.renderDepth) ragdoll.renderDepth = {};
    ragdoll.renderDepth[key] = { z };
}

/** Sim xy + frozen z for hit tests, blood spawn, world mapping. */
export function mergeRagdollPoint(ragdoll, key) {
    const sim = ragdoll.points?.[key];
    if (!sim) return null;
    return { x: sim.x, y: sim.y, z: getRagdollPointZ(ragdoll, key) };
}

export function getRagdollCollisionPoints(ragdoll) {
    const out = {};
    for (const key of Object.keys(ragdoll.points ?? {})) {
        out[key] = mergeRagdollPoint(ragdoll, key);
    }
    return out;
}

function toRenderPoint(ragdoll, key) {
    return mergeRagdollPoint(ragdoll, key);
}

export function initializeRagdoll(rigData, rotation, impactProfile, config, rig) {
    const fullPoints = boneMapFromCharacterRig(rigData);

    const yOffset = (rig.size / 32) * 2.0;
    for (const key of Object.keys(fullPoints)) {
        fullPoints[key].y -= yOffset;
    }

    const renderDepth = {};
    const points = {};
    for (const key of Object.keys(fullPoints)) {
        renderDepth[key] = { z: fullPoints[key].z };
        points[key] = { x: fullPoints[key].x, y: fullPoints[key].y };
    }

    const dist = (a, b) => Math.hypot(
        fullPoints[a].x - fullPoints[b].x,
        fullPoints[a].y - fullPoints[b].y,
        fullPoints[a].z - fullPoints[b].z,
    );

    const constraints = RAGDOLL_CONSTRAINT_EDGES.map(([a, b]) => ({
        a,
        b,
        len: dist(a, b),
    }));

    const prevPoints = {};
    const { force, hitBone } = impactProfile;
    const phys = getScaledPhysics(rig.size);
    const velocityScaler = phys.VELOCITY_SCALER;
    const hit = points[hitBone] ? hitBone : "spineTop";

    for (const key of Object.keys(points)) {
        const p = points[key];
        let vx;
        let vy;
        if (key === hit) {
            vx = force.x * velocityScaler;
            vy = force.y * velocityScaler;
        } else {
            const d = Math.hypot(p.x - points[hit].x, p.y - points[hit].y);
            const distFactor = Math.max(0, 1 - d / (rig.size * 1.5));
            const transfer = phys.IMPACT_DISTRIBUTION * distFactor;
            vx = force.x * transfer * velocityScaler;
            vy = force.y * transfer * velocityScaler;
        }
        vx += (Math.random() - 0.5) * phys.CHAOS;
        vy += (Math.random() - 0.5) * phys.CHAOS;
        prevPoints[key] = { x: p.x - vx, y: p.y - vy };
    }

    return {
        points,
        prevPoints,
        constraints,
        groundY: rig.groundY,
        rotation,
        time: 0,
        settled: false,
        sleepTimer: 0,
        severed: {},
        partHealth: {},
        splitCounts: {},
        particles: [],
        emitters: [],
        floorStains: [],
        renderDepth,
    };
}

function applyJointLimits(ragdoll) {
    const { points, constraints } = ragdoll;
    const limits = RAGDOLL_CONFIG.CONSTRAINTS.JOINT_ANGLES;
    const areConnected = (pA, pB) => constraints.some(
        (c) => (c.a === pA && c.b === pB) || (c.a === pB && c.b === pA),
    );
    const limitElbow = (shoulder, elbow, hand, minAngle, maxAngle) => {
        const v1x = elbow.x - shoulder.x;
        const v1y = elbow.y - shoulder.y;
        const v2x = hand.x - elbow.x;
        const v2y = hand.y - elbow.y;
        const angle = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
        if (angle < minAngle || angle > maxAngle) {
            const clamped = Math.max(minAngle, Math.min(maxAngle, angle));
            const len = Math.hypot(v2x, v2y);
            const baseAngle = Math.atan2(v1y, v1x);
            hand.x = elbow.x + Math.cos(baseAngle + clamped) * len;
            hand.y = elbow.y + Math.sin(baseAngle + clamped) * len;
        }
    };
    if (areConnected("rShoulder", "rElbow")) {
        limitElbow(points.rShoulder, points.rElbow, points.rHand, limits.ELBOW.min, limits.ELBOW.max);
    }
    if (areConnected("lShoulder", "lElbow")) {
        limitElbow(points.lShoulder, points.lElbow, points.lHand, limits.ELBOW.min, limits.ELBOW.max);
    }
    if (areConnected("rHip", "rKnee")) {
        limitElbow(points.rHip, points.rKnee, points.rFoot, limits.KNEE.min, limits.KNEE.max);
    }
    if (areConnected("lHip", "lKnee")) {
        limitElbow(points.lHip, points.lKnee, points.lFoot, limits.KNEE.min, limits.KNEE.max);
    }
    if (areConnected("spineTop", "head")) {
        limitElbow(points.spineBot, points.spineTop, points.head, limits.NECK.min, limits.NECK.max);
    }
}

/**
 * Apply impulse to ragdoll bones; may fracture or sever on repeated hits.
 */
export function applyRagdollImpulse(
    ragdoll,
    forceX,
    forceY,
    forceZ,
    hitPart,
    rig,
    rotation,
    config,
    damageVal = 12,
    offsetT = 0.5,
) {
    if (!ragdoll?.points) return;

    const bodyOffset = config?.BODY_OFFSET ?? Math.PI;
    const bRot = rotation + bodyOffset;
    const cos = Math.cos(-bRot);
    const sin = Math.sin(-bRot);
    const localFx = forceX * cos - forceZ * sin;
    const forceVec = { x: localFx, y: forceY };

    const phys = getScaledPhysics(rig.size);
    const velocityScaler = phys.VELOCITY_SCALER;
    const { points, prevPoints, constraints } = ragdoll;

    let impulseCenter = resolvePhysicsBoneId(hitPart, points);
    if (!impulseCenter) return;

    ragdoll.settled = false;
    ragdoll.sleepTimer = 0;

    const affectedSet = new Set();
    const queue = [{ id: impulseCenter, depth: 0 }];
    affectedSet.add(impulseCenter);
    while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (depth >= 2) continue;
        for (const c of constraints) {
            if (c.a === id && !affectedSet.has(c.b)) {
                affectedSet.add(c.b);
                queue.push({ id: c.b, depth: depth + 1 });
            } else if (c.b === id && !affectedSet.has(c.a)) {
                affectedSet.add(c.a);
                queue.push({ id: c.a, depth: depth + 1 });
            }
        }
    }

    const maxInfluence = rig.size * 0.45;
    const centerP = points[impulseCenter];

    for (const key of Object.keys(points)) {
        if (!affectedSet.has(key)) continue;
        const p = points[key];
        const prev = prevPoints[key];
        if (!prev) continue;
        if (key === impulseCenter) {
            prev.x -= forceVec.x * velocityScaler;
            prev.y -= forceVec.y * velocityScaler;
            continue;
        }
        const d = Math.hypot(p.x - centerP.x, p.y - centerP.y);
        if (d > maxInfluence) continue;
        const distFactor = Math.max(0, 1 - d / maxInfluence);
        const transfer = phys.IMPACT_DISTRIBUTION * distFactor * distFactor;
        if (transfer <= 1e-6) continue;
        prev.x -= forceVec.x * transfer * velocityScaler;
        prev.y -= forceVec.y * transfer * velocityScaler;
    }

    processRagdollGoreHit(
        ragdoll,
        forceX,
        forceY,
        forceZ,
        hitPart,
        damageVal,
        offsetT,
        rig,
    );
}

/** Character rig for render: sim xy + frozen death z. */
export function getRagdollRenderRig(ragdoll) {
    const boneMap = {};
    for (const boneId of PHYSICS_BONES) {
        const p = toRenderPoint(ragdoll, boneId);
        if (p) boneMap[boneId] = p;
    }
    return characterRigFromBoneMap(boneMap);
}

/**
 * @param {object} ragdoll
 * @param {number} dtSec
 * @param {number} worldX - corpse center X (world)
 * @param {number} worldY - corpse center Y (world)
 * @param {number} rotation - body facing at death
 * @param {(wx: number, wy: number) => boolean} wallChecker - true if blocked
 * @param {number} playerX
 * @param {number} playerY
 * @param {object} rig
 */
export function updateRagdoll(ragdoll, dtSec, worldX, worldY, rotation, wallChecker, playerX, playerY, rig) {
    if (!ragdoll) return;

    const distToPlayer = Math.abs(worldX - playerX) + Math.abs(worldY - playerY);
    if (distToPlayer > 400 && ragdoll.sleepTimer > 0.1) return;
    if (distToPlayer > 240 && Math.random() > 0.5) return;

    if (ragdoll.settled) {
        ragdoll.sleepTimer += dtSec;
        return;
    }

    let totalMotion = 0;
    const { points, prevPoints, constraints, groundY } = ragdoll;
    const cfg = RAGDOLL_CONFIG;
    const phys = getScaledPhysics(rig.size);
    const dt = Math.min(dtSec, 0.033);
    const dt2 = dt * dt;
    ragdoll.time += dt;

    for (const key of Object.keys(points)) {
        const p = points[key];
        const prev = prevPoints[key];
        let vx = (p.x - prev.x) * phys.AIR_DRAG;
        let vy = (p.y - prev.y) * phys.AIR_DRAG;
        const speed = Math.hypot(vx, vy);
        if (speed > phys.SPEED_CAP) {
            const cap = phys.SPEED_CAP / speed;
            vx *= cap;
            vy *= cap;
        }
        prev.x = p.x;
        prev.y = p.y;
        p.x += vx;
        p.y += vy + phys.GRAVITY * 1000 * dt2;
    }

    const scale = 1 / rig.size;
    const invScale = rig.size;
    const visualRotation = rotation + Math.PI;
    const cos = Math.cos(visualRotation);
    const sin = Math.sin(visualRotation);

    const getBodyPartRadius = (key) => {
        const baseName = key.split("_")[0];
        if (baseName === "head") return rig.headR;
        if (baseName === "spineTop" || baseName === "spineBot") return rig.torsoHalfWidth;
        if (key.includes("Shoulder") || key.includes("Elbow") || key.includes("Hand")) return rig.armL1 * 0.3;
        if (key.includes("Hip") || key.includes("Knee") || key.includes("Foot")) return rig.legL1 * 0.3;
        return rig.size * 0.1;
    };

    for (let step = 0; step < phys.COLLISION_STEPS; step++) {
        if (wallChecker) {
            for (const key of Object.keys(points)) {
                const p = points[key];
                const prev = prevPoints[key];
                const worldRadius = getBodyPartRadius(key) * scale * 0.85;
                const depthZ = getRagdollPointZ(ragdoll, key);
                const localX = p.x * scale;
                const localZ = depthZ * scale;
                const worldOffsetX = localX * cos - localZ * sin;
                const worldOffsetY = localX * sin + localZ * cos;
                const wX = worldX + worldOffsetX;
                const wY = worldY + worldOffsetY;

                if (!wallChecker(wX, wY)) continue;

                const pushLen = worldRadius * 0.5;
                const pushDist = Math.hypot(worldOffsetX, worldOffsetY) || 1;
                const pushLocalX = (-worldOffsetX / pushDist) * pushLen * invScale;
                p.x += pushLocalX;
                prev.x = p.x - (p.x - prev.x) * phys.WALL_FRICTION;
            }
        }

        let conIterations = cfg.CONSTRAINTS.ITERATIONS;
        if (ragdoll.sleepTimer > 0.5) conIterations = 1;

        for (let i = 0; i < conIterations; i++) {
            for (const c of constraints) {
                const pA = points[c.a];
                const pB = points[c.b];
                const dx = pB.x - pA.x;
                const dy = pB.y - pA.y;
                const dz = getRagdollPointZ(ragdoll, c.b) - getRagdollPointZ(ragdoll, c.a);
                const dist = Math.hypot(dx, dy, dz);
                if (dist < 0.0001) continue;
                const diff = (dist - c.len) / dist;
                const m = 0.5 * cfg.CONSTRAINTS.STIFFNESS;
                const ox = dx * diff * m;
                const oy = dy * diff * m;
                pA.x += ox;
                pA.y += oy;
                pB.x -= ox;
                pB.y -= oy;
            }
            applyJointLimits(ragdoll);
        }
    }

    for (const key of Object.keys(points)) {
        const p = points[key];
        const prev = prevPoints[key];
        const r = getBodyPartRadius(key);
        const floor = groundY - r * 0.5;
        if (p.y > floor) {
            p.y = floor;
            prev.y = floor;
            const vx = p.x - prev.x;
            prev.x = p.x - vx * phys.GROUND_FRICTION;
        }
    }

    for (const key of Object.keys(points)) {
        const p = points[key];
        const prev = prevPoints[key];
        totalMotion += (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2;
    }

    if (totalMotion < 0.005) {
        ragdoll.sleepTimer = (ragdoll.sleepTimer || 0) + dt;
        if (ragdoll.sleepTimer > 1.0) {
            ragdoll.settled = true;
        }
    } else {
        ragdoll.sleepTimer = 0;
        ragdoll.settled = false;
    }
}
