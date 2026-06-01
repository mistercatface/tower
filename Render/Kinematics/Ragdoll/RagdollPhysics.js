import { RAGDOLL_CONFIG, getScaledPhysics } from "./RagdollConfig.js";

function clonePoint(p) {
    return { x: p.x, y: p.y, z: p.z || 0 };
}

export function initializeRagdoll(rigData, rotation, impactProfile, config, rig) {
    const points = {
        head: clonePoint(rigData.head),
        spineTop: clonePoint(rigData.spineTop),
        spineBot: clonePoint(rigData.spineBot),
        rShoulder: clonePoint(rigData.rArm.p1),
        rElbow: clonePoint(rigData.rArm.p2),
        rHand: clonePoint(rigData.rArm.p3),
        lShoulder: clonePoint(rigData.lArm.p1),
        lElbow: clonePoint(rigData.lArm.p2),
        lHand: clonePoint(rigData.lArm.p3),
        rHip: clonePoint(rigData.rLeg.p1),
        rKnee: clonePoint(rigData.rLeg.p2),
        rFoot: clonePoint(rigData.rLeg.p3),
        lHip: clonePoint(rigData.lLeg.p1),
        lKnee: clonePoint(rigData.lLeg.p2),
        lFoot: clonePoint(rigData.lLeg.p3),
    };

    const yOffset = (rig.size / 32) * 2.0;
    for (const key of Object.keys(points)) {
        points[key].y -= yOffset;
    }

    const dist = (a, b) => Math.hypot(
        points[a].x - points[b].x,
        points[a].y - points[b].y,
        points[a].z - points[b].z,
    );

    const constraints = [
        { a: "head", b: "spineTop", len: dist("head", "spineTop") },
        { a: "spineTop", b: "spineBot", len: dist("spineTop", "spineBot") },
        { a: "spineTop", b: "rShoulder", len: dist("spineTop", "rShoulder") },
        { a: "rShoulder", b: "rElbow", len: dist("rShoulder", "rElbow") },
        { a: "rElbow", b: "rHand", len: dist("rElbow", "rHand") },
        { a: "spineTop", b: "lShoulder", len: dist("spineTop", "lShoulder") },
        { a: "lShoulder", b: "lElbow", len: dist("lShoulder", "lElbow") },
        { a: "lElbow", b: "lHand", len: dist("lElbow", "lHand") },
        { a: "spineBot", b: "rHip", len: dist("spineBot", "rHip") },
        { a: "rHip", b: "rKnee", len: dist("rHip", "rKnee") },
        { a: "rKnee", b: "rFoot", len: dist("rKnee", "rFoot") },
        { a: "spineBot", b: "lHip", len: dist("spineBot", "lHip") },
        { a: "lHip", b: "lKnee", len: dist("lHip", "lKnee") },
        { a: "lKnee", b: "lFoot", len: dist("lKnee", "lFoot") },
        { a: "rShoulder", b: "lShoulder", len: dist("rShoulder", "lShoulder") },
        { a: "rHip", b: "lHip", len: dist("rHip", "lHip") },
    ];

    const prevPoints = {};
    const { force, hitBone } = impactProfile;
    const phys = getScaledPhysics(rig.size);
    const velocityScaler = phys.VELOCITY_SCALER;
    const hit = points[hitBone] ? hitBone : "spineTop";

    for (const key of Object.keys(points)) {
        const p = points[key];
        let vx;
        let vy;
        let vz;
        if (key === hit) {
            vx = force.x * velocityScaler;
            vy = force.y * velocityScaler;
            vz = force.z * velocityScaler;
        } else {
            const d = Math.hypot(p.x - points[hit].x, p.y - points[hit].y, p.z - points[hit].z);
            const distFactor = Math.max(0, 1 - d / (rig.size * 1.5));
            const transfer = phys.IMPACT_DISTRIBUTION * distFactor;
            vx = force.x * transfer * velocityScaler;
            vy = force.y * transfer * velocityScaler;
            vz = force.z * transfer * velocityScaler;
        }
        vx += (Math.random() - 0.5) * phys.CHAOS;
        vy += (Math.random() - 0.5) * phys.CHAOS;
        vz += (Math.random() - 0.5) * phys.CHAOS;
        prevPoints[key] = { x: p.x - vx, y: p.y - vy, z: p.z - vz };
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
        particles: [],
        emitters: [],
        floorStains: [],
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

const PART_ALIASES = {
    torso: "spineTop",
    rLeg: "rHip",
    lLeg: "lHip",
    rArm: "rShoulder",
    lArm: "lShoulder",
};

/**
 * Apply impulse to ragdoll bones (physics only — no sever/fracture).
 */
export function applyRagdollImpulse(ragdoll, forceX, forceY, forceZ, hitPart, rig, rotation, config) {
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

    let impulseCenter = hitPart;
    if (!points[impulseCenter]) {
        const clean = hitPart.split("_")[0];
        impulseCenter = PART_ALIASES[clean] ?? clean;
    }
    if (!points[impulseCenter] && hitPart.includes("_")) {
        const segments = hitPart.split("_");
        for (let i = segments.length - 1; i >= 0; i--) {
            const candidate = segments.slice(0, i + 1).join("_");
            if (points[candidate]) {
                impulseCenter = candidate;
                break;
            }
        }
    }
    if (!points[impulseCenter]) {
        impulseCenter = "spineTop";
    }
    if (!points[impulseCenter]) return;

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
            prev.z -= forceVec.z * velocityScaler;
            continue;
        }
        const d = Math.hypot(p.x - centerP.x, p.y - centerP.y, p.z - centerP.z);
        if (d > maxInfluence) continue;
        const distFactor = Math.max(0, 1 - d / maxInfluence);
        const transfer = phys.IMPACT_DISTRIBUTION * distFactor * distFactor;
        if (transfer <= 1e-6) continue;
        prev.x -= forceVec.x * transfer * velocityScaler;
        prev.y -= forceVec.y * transfer * velocityScaler;
        prev.z -= forceVec.z * transfer * velocityScaler;
    }
}

export function getRagdollRig(ragdoll) {
    const { points } = ragdoll;
    return {
        spineTop: points.spineTop,
        spineBot: points.spineBot,
        head: points.head,
        rArm: { p1: points.rShoulder, p2: points.rElbow, p3: points.rHand },
        lArm: { p1: points.lShoulder, p2: points.lElbow, p3: points.lHand },
        rLeg: { p1: points.rHip, p2: points.rKnee, p3: points.rFoot },
        lLeg: { p1: points.lHip, p2: points.lKnee, p3: points.lFoot },
    };
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
        let vz = (p.z - prev.z) * phys.AIR_DRAG;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > phys.SPEED_CAP) {
            const scale = phys.SPEED_CAP / speed;
            vx *= scale;
            vy *= scale;
            vz *= scale;
        }
        prev.x = p.x;
        prev.y = p.y;
        prev.z = p.z;
        p.x += vx;
        p.y += vy + phys.GRAVITY * 1000 * dt2;
        p.z += vz;
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
                const localX = p.x * scale;
                const localZ = p.z * scale;
                const worldOffsetX = localX * cos - localZ * sin;
                const worldOffsetY = localX * sin + localZ * cos;
                const wX = worldX + worldOffsetX;
                const wY = worldY + worldOffsetY;

                if (!wallChecker(wX, wY)) continue;

                const pushLen = worldRadius * 0.5;
                const pushLocalX = (-worldOffsetX / (Math.hypot(worldOffsetX, worldOffsetY) || 1)) * pushLen * invScale;
                const pushLocalZ = (-worldOffsetY / (Math.hypot(worldOffsetX, worldOffsetY) || 1)) * pushLen * invScale;
                p.x += pushLocalX;
                p.z += pushLocalZ;
                prev.x = p.x - (p.x - prev.x) * phys.WALL_FRICTION;
                prev.z = p.z - (p.z - prev.z) * phys.WALL_FRICTION;
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
                const dz = pB.z - pA.z;
                const dist = Math.hypot(dx, dy, dz);
                if (dist < 0.0001) continue;
                const diff = (dist - c.len) / dist;
                const m = 0.5 * cfg.CONSTRAINTS.STIFFNESS;
                const ox = dx * diff * m;
                const oy = dy * diff * m;
                const oz = dz * diff * m;
                pA.x += ox;
                pA.y += oy;
                pA.z += oz;
                pB.x -= ox;
                pB.y -= oy;
                pB.z -= oz;
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
            const vz = p.z - prev.z;
            prev.x = p.x - vx * phys.GROUND_FRICTION;
            prev.z = p.z - vz * phys.GROUND_FRICTION;
        }
    }

    for (const key of Object.keys(points)) {
        const p = points[key];
        const prev = prevPoints[key];
        totalMotion += (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 + (p.z - prev.z) ** 2;
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
