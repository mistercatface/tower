import { RAGDOLL_CONFIG, getScaledPhysics } from "./RagdollConfig.js";
import { processRagdollGoreHit } from "./RagdollGore.js";
import {
    PHYSICS_BONES,
    RAGDOLL_CONSTRAINT_EDGES,
    boneMapFromCharacterRig,
    resolvePhysicsBoneId,
} from "../KinematicsBones.js";

function getBind(ragdoll, key) {
    return ragdoll.bindBones?.[key];
}

function getDelta(ragdoll, key) {
    return ragdoll.points?.[key];
}

/** Bind-pose xyz + sim xy delta (z always from bind). */
export function absRagdollPoint(ragdoll, key) {
    const bind = getBind(ragdoll, key);
    const delta = getDelta(ragdoll, key);
    if (!bind || !delta) return null;
    return {
        x: bind.x + delta.x,
        y: bind.y + delta.y,
        z: bind.z + (delta.z ?? 0),
    };
}

export function getRagdollPointZ(ragdoll, key) {
    return getBind(ragdoll, key)?.z ?? 0;
}

export function getRagdollCollisionPoints(ragdoll) {
    const out = {};
    for (const key of Object.keys(ragdoll.points ?? {})) {
        out[key] = absRagdollPoint(ragdoll, key);
    }
    return out;
}

function setAbsXYZ(ragdoll, key, x, y, z) {
    const bind = getBind(ragdoll, key);
    const delta = getDelta(ragdoll, key);
    if (!bind || !delta) return;
    delta.x = x - bind.x;
    delta.y = y - bind.y;
    delta.z = z - bind.z;
}

export function ensureSimBone(ragdoll, key, bindPos) {
    if (!ragdoll.bindBones) ragdoll.bindBones = {};
    if (!ragdoll.points) ragdoll.points = {};
    if (!ragdoll.prevPoints) ragdoll.prevPoints = {};
    if (!ragdoll.bindBones[key]) {
        ragdoll.bindBones[key] = { x: bindPos.x, y: bindPos.y, z: bindPos.z ?? 0 };
    }
    if (!ragdoll.points[key]) {
        ragdoll.points[key] = { x: 0, y: 0, z: 0 };
        ragdoll.prevPoints[key] = { x: 0, y: 0, z: 0 };
    }
}

/** Sim stores xy deltas from bind pose; bind pose z is never written by physics. */
export function initializeRagdoll(rigData, rotation, impactProfile, config, rig) {
    const bindBones = boneMapFromCharacterRig(rigData);
    const points = {};
    const prevPoints = {};

    for (const key of PHYSICS_BONES) {
        points[key] = { x: 0, y: 0, z: 0 };
        prevPoints[key] = { x: 0, y: 0, z: 0 };
    }

    const dist3 = (a, b) => {
        const pa = bindBones[a];
        const pb = bindBones[b];
        return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
    };

    const constraints = RAGDOLL_CONSTRAINT_EDGES.map(([a, b]) => ({
        a,
        b,
        len: dist3(a, b),
    }));

    const { force, hitBone } = impactProfile;
    const phys = getScaledPhysics(rig.size);
    const velocityScaler = phys.VELOCITY_SCALER;
    const hit = resolvePhysicsBoneId(hitBone, points) ?? "spineTop";
    const hitBind = bindBones[hit];

    for (const key of PHYSICS_BONES) {
        let vx, vy, vz;
        if (key === hit) {
            vx = force.x * velocityScaler;
            vy = force.y * velocityScaler;
            vz = force.z * velocityScaler;
        } else {
            const b = bindBones[key];
            const d = Math.hypot(b.x - hitBind.x, b.y - hitBind.y, b.z - hitBind.z);
            const distFactor = Math.max(0, 1 - d / (rig.size * 1.5));
            const transfer = phys.IMPACT_DISTRIBUTION * distFactor;
            vx = force.x * transfer * velocityScaler;
            vy = force.y * transfer * velocityScaler;
            vz = force.z * transfer * velocityScaler;
        }
        vx += (Math.random() - 0.5) * phys.CHAOS;
        vy += (Math.random() - 0.5) * phys.CHAOS;
        vz += (Math.random() - 0.5) * phys.CHAOS;
        prevPoints[key] = { x: -vx, y: -vy, z: -vz };
    }

    return {
        bindBones,
        /** Per-bone xy offset from bind pose (sim only; z lives in bindBones). */
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
    };
}

function applyJointLimits(ragdoll) {
    const { constraints } = ragdoll;
    const limits = RAGDOLL_CONFIG.CONSTRAINTS.JOINT_ANGLES;
    const areConnected = (pA, pB) => constraints.some(
        (c) => (c.a === pA && c.b === pB) || (c.a === pB && c.b === pA),
    );
    const limitElbow = (shoulder, elbow, hand, minAngle, maxAngle) => {
        const s = absRagdollPoint(ragdoll, shoulder);
        const e = absRagdollPoint(ragdoll, elbow);
        const h = absRagdollPoint(ragdoll, hand);
        if (!s || !e || !h) return;
        const v1x = e.x - s.x;
        const v1y = e.y - s.y;
        const v2x = h.x - e.x;
        const v2y = h.y - e.y;
        const angle = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
        if (angle < minAngle || angle > maxAngle) {
            const clamped = Math.max(minAngle, Math.min(maxAngle, angle));
            const len = Math.hypot(v2x, v2y);
            const baseAngle = Math.atan2(v1y, v1x);
            setAbsXYZ(
                ragdoll,
                hand,
                e.x + Math.cos(baseAngle + clamped) * len,
                e.y + Math.sin(baseAngle + clamped) * len,
                h.z
            );
        }
    };
    if (areConnected("rShoulder", "rElbow")) {
        limitElbow("rShoulder", "rElbow", "rHand", limits.ELBOW.min, limits.ELBOW.max);
    }
    if (areConnected("lShoulder", "lElbow")) {
        limitElbow("lShoulder", "lElbow", "lHand", limits.ELBOW.min, limits.ELBOW.max);
    }
    if (areConnected("rHip", "rKnee")) {
        limitElbow("rHip", "rKnee", "rFoot", limits.KNEE.min, limits.KNEE.max);
    }
    if (areConnected("lHip", "lKnee")) {
        limitElbow("lHip", "lKnee", "lFoot", limits.KNEE.min, limits.KNEE.max);
    }
    if (areConnected("spineTop", "head")) {
        limitElbow("spineBot", "spineTop", "head", limits.NECK.min, limits.NECK.max);
    }
}

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
    const localFz = forceX * sin + forceZ * cos;
    const forceVec = { x: localFx, y: forceY, z: localFz };

    const phys = getScaledPhysics(rig.size);
    const velocityScaler = phys.VELOCITY_SCALER;
    const { points, prevPoints, constraints } = ragdoll;

    const impulseCenter = resolvePhysicsBoneId(hitPart, points);
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
    const centerAbs = absRagdollPoint(ragdoll, impulseCenter);

    for (const key of Object.keys(points)) {
        if (!affectedSet.has(key)) continue;
        const prev = prevPoints[key];
        const abs = absRagdollPoint(ragdoll, key);
        if (!prev || !abs) continue;
        if (key === impulseCenter) {
            prev.x -= forceVec.x * velocityScaler;
            prev.y -= forceVec.y * velocityScaler;
            prev.z -= forceVec.z * velocityScaler;
            continue;
        }
        const d = Math.hypot(abs.x - centerAbs.x, abs.y - centerAbs.y, abs.z - centerAbs.z);
        if (d > maxInfluence) continue;
        const distFactor = Math.max(0, 1 - d / maxInfluence);
        const transfer = phys.IMPACT_DISTRIBUTION * distFactor * distFactor;
        if (transfer <= 1e-6) continue;
        prev.x -= forceVec.x * transfer * velocityScaler;
        prev.y -= forceVec.y * transfer * velocityScaler;
        prev.z -= forceVec.z * transfer * velocityScaler;
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

export function updateRagdoll(ragdoll, dtSec, worldX, worldY, rotation, wallChecker, playerX, playerY, rig) {
    if (!ragdoll) return { shiftX: 0, shiftY: 0 };

    const distToPlayer = Math.abs(worldX - playerX) + Math.abs(worldY - playerY);
    if (distToPlayer > 400 && ragdoll.sleepTimer > 0.1) return { shiftX: 0, shiftY: 0 };
    if (distToPlayer > 240 && Math.random() > 0.5) return { shiftX: 0, shiftY: 0 };

    if (ragdoll.settled) {
        ragdoll.sleepTimer += dtSec;
        return { shiftX: 0, shiftY: 0 };
    }

    let totalMotion = 0;
    const { points, prevPoints, constraints, groundY } = ragdoll;
    const cfg = RAGDOLL_CONFIG;
    const phys = getScaledPhysics(rig.size);
    const dt = Math.min(dtSec, 0.033);
    const dt2 = dt * dt;
    ragdoll.time += dt;

    for (const key of Object.keys(points)) {
        const delta = points[key];
        const prev = prevPoints[key];
        let vx = (delta.x - prev.x) * phys.AIR_DRAG;
        let vy = (delta.y - prev.y) * phys.AIR_DRAG;
        let vz = ((delta.z ?? 0) - (prev.z ?? 0)) * phys.AIR_DRAG;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > phys.SPEED_CAP) {
            const cap = phys.SPEED_CAP / speed;
            vx *= cap;
            vy *= cap;
            vz *= cap;
        }
        prev.x = delta.x;
        prev.y = delta.y;
        prev.z = delta.z ?? 0;
        delta.x += vx;
        delta.y += vy + phys.GRAVITY * 1000 * dt2;
        delta.z = (delta.z ?? 0) + vz;
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
                const abs = absRagdollPoint(ragdoll, key);
                const prev = prevPoints[key];
                if (!abs || !prev) continue;
                const worldRadius = getBodyPartRadius(key) * scale * 0.85;
                const localX = abs.x * scale;
                const localZ = abs.z * scale;
                const worldOffsetX = localX * cos - localZ * sin;
                const worldOffsetY = localX * sin + localZ * cos;
                const wX = worldX + worldOffsetX;
                const wY = worldY + worldOffsetY;

                if (!wallChecker(wX, wY)) continue;

                const pushLen = worldRadius * 0.5;
                const pushDist = Math.hypot(worldOffsetX, worldOffsetY) || 1;
                const pushLocalX = (-worldOffsetX / pushDist) * pushLen * invScale;
                const pushLocalZ = (-worldOffsetY / pushDist) * pushLen * invScale;
                setAbsXYZ(ragdoll, key, abs.x + pushLocalX, abs.y, abs.z + pushLocalZ);
                const delta = points[key];
                prev.x = delta.x - (delta.x - prev.x) * phys.WALL_FRICTION;
            }
        }

        let conIterations = cfg.CONSTRAINTS.ITERATIONS;
        if (ragdoll.sleepTimer > 0.5) conIterations = 1;

        for (let i = 0; i < conIterations; i++) {
            for (const c of constraints) {
                const absA = absRagdollPoint(ragdoll, c.a);
                const absB = absRagdollPoint(ragdoll, c.b);
                if (!absA || !absB) continue;
                const dx = absB.x - absA.x;
                const dy = absB.y - absA.y;
                const dz = absB.z - absA.z;
                const dist = Math.hypot(dx, dy, dz);
                if (dist < 0.0001) continue;
                const diff = (dist - c.len) / dist;
                const m = 0.5 * cfg.CONSTRAINTS.STIFFNESS;
                const ox = dx * diff * m;
                const oy = dy * diff * m;
                const oz = dz * diff * m;
                setAbsXYZ(ragdoll, c.a, absA.x + ox, absA.y + oy, absA.z + oz);
                setAbsXYZ(ragdoll, c.b, absB.x - ox, absB.y - oy, absB.z - oz);
            }
            applyJointLimits(ragdoll);
        }
    }

    for (const key of Object.keys(points)) {
        const bind = getBind(ragdoll, key);
        const delta = points[key];
        const prev = prevPoints[key];
        if (!bind || !delta || !prev) continue;
        const r = getBodyPartRadius(key);
        const floor = groundY - r * 0.5;
        const absY = bind.y + delta.y;
        if (absY > floor) {
            delta.y = floor - bind.y;
            prev.y = delta.y;
            const vx = delta.x - prev.x;
            const vz = (delta.z ?? 0) - (prev.z ?? 0);
            prev.x = delta.x - vx * phys.GROUND_FRICTION;
            prev.z = (delta.z ?? 0) - vz * phys.GROUND_FRICTION;
        }
    }

    for (const key of Object.keys(points)) {
        const delta = points[key];
        const prev = prevPoints[key];
        totalMotion += (delta.x - prev.x) ** 2 + (delta.y - prev.y) ** 2;
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

    const spineTopDelta = points.spineTop;
    const localShiftX = spineTopDelta.x;
    const localShiftZ = spineTopDelta.z ?? 0;
    
    if (Math.hypot(localShiftX, localShiftZ) > 1.0) {
        for (const key of Object.keys(points)) {
            points[key].x -= localShiftX;
            points[key].z = (points[key].z ?? 0) - localShiftZ;
            prevPoints[key].x -= localShiftX;
            prevPoints[key].z = (prevPoints[key].z ?? 0) - localShiftZ;
        }
        
        const localX = localShiftX * scale;
        const localZ = localShiftZ * scale;
        const worldShiftX = localX * cos - localZ * sin;
        const worldShiftY = localX * sin + localZ * cos;
        
        return { shiftX: worldShiftX, shiftY: worldShiftY };
    }
    
    return { shiftX: 0, shiftY: 0 };
}
