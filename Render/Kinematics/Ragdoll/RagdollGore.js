import { clamp } from "../../../Libraries/Math/Interpolate.js";
import { distance, length } from "../../../Libraries/Math/Vec3.js";
import { RAGDOLL_CONFIG, SEVER_MAP } from "./RagdollConfig.js";
import { absRagdollPoint, ensureSimBone, getRagdollPointZ } from "./RagdollPhysics.js";
import { PHYSICS_BONE_ALIASES, SEVER_LIMB_DEF, SEVER_TORSO_PEER } from "../../../Libraries/Kinematics/core/bones.js";

/** Map hit bone (incl. torso capsules) to a severable limb id. */
export function resolveSeverTarget(hitPart, ragdoll) {
    if (SEVER_MAP[hitPart]) return SEVER_MAP[hitPart];

    const clean = hitPart.split("_fr_")[0].split("_fracture_")[0];
    if (SEVER_MAP[clean]) return SEVER_MAP[clean];

    for (const segment of clean.split("_")) {
        if (SEVER_MAP[segment]) return SEVER_MAP[segment];
    }

    const points = ragdoll?.points;
    if (!points) return null;

    if (clean === "head") return null;

    if (clean === "spineTop") {
        const rsZ = getRagdollPointZ(ragdoll, "rShoulder");
        const lsZ = getRagdollPointZ(ragdoll, "lShoulder");
        if (points.rShoulder && points.lShoulder) {
            return Math.abs(rsZ) >= Math.abs(lsZ) ? "rArm" : "lArm";
        }
        return Math.random() < 0.5 ? "rArm" : "lArm";
    }
    if (clean === "spineBot") {
        const rhZ = getRagdollPointZ(ragdoll, "rHip");
        const lhZ = getRagdollPointZ(ragdoll, "lHip");
        if (points.rHip && points.lHip) {
            return Math.abs(rhZ) >= Math.abs(lhZ) ? "rLeg" : "lLeg";
        }
        return Math.random() < 0.5 ? "rLeg" : "lLeg";
    }
    return null;
}

function disconnectLimbFromTorso(constraints, limbId, root) {
    const peer = SEVER_TORSO_PEER[limbId];
    if (!peer) return constraints;
    return constraints.filter((c) => !((c.a === peer && c.b === root) || (c.a === root && c.b === peer)));
}

function getPartCategory(partName) {
    const clean = partName.split("_fr_")[0].split("_fracture_")[0];
    if (clean === "head") return "head";
    if (clean.includes("spine") || clean === "torso") return "torso";
    return "limb";
}

function getBasePart(name) {
    const match = name.match(/^(head|torso|spine\w*|[rl](?:Arm|Leg|Shoulder|Elbow|Hand|Hip|Knee|Foot|Forearm|Shin))/i);
    return match ? match[1] : name;
}

function countSplits(ragdoll, partName) {
    if (!ragdoll?.splitCounts) return 0;
    return ragdoll.splitCounts[getBasePart(partName)] || 0;
}

function incrementSplitCount(ragdoll, partName) {
    if (!ragdoll) return;
    if (!ragdoll.splitCounts) ragdoll.splitCounts = {};
    const basePart = getBasePart(partName);
    ragdoll.splitCounts[basePart] = (ragdoll.splitCounts[basePart] || 0) + 1;
}

function canSplitPart(ragdoll, partName) {
    const category = getPartCategory(partName);
    const maxSplits = RAGDOLL_CONFIG.GORE.MAX_SPLITS[category];
    if (maxSplits == null) return false;
    return countSplits(ragdoll, partName) < maxSplits;
}

export function severLimb(ragdoll, limbId, rig) {
    if (!ragdoll || !limbId || ragdoll.severed[limbId]) return;

    const data = SEVER_LIMB_DEF[limbId];
    if (!data) return;

    ragdoll.severed[limbId] = true;
    const { points, prevPoints } = ragdoll;
    let { constraints } = ragdoll;
    const rootAbs = absRagdollPoint(ragdoll, data.root);
    if (!rootAbs) return;

    constraints = disconnectLimbFromTorso(constraints, limbId, data.root);
    ragdoll.constraints = constraints;

    if (data.type === "simple") {
        ragdoll.constraints = constraints.filter((c) => c.a !== data.root && c.b !== data.root);
        const headChunkId = `${data.root}_chunk`;
        ensureSimBone(ragdoll, headChunkId, { x: rootAbs.x, y: rootAbs.y + rig.headR * 0.5, z: rootAbs.z });
        ragdoll.constraints.push({ a: data.root, b: headChunkId, len: rig.headR * 0.5 });
    } else if (data.type === "joint") {
        const newPointId = `${data.root}_severed_${Date.now()}`;
        ensureSimBone(ragdoll, newPointId, rootAbs);
        for (const c of ragdoll.constraints) {
            if (c.a === data.root) c.a = newPointId;
        }
        const kick = rig.size * 0.08;
        const side = limbId.startsWith("l") ? -1 : 1;
        prevPoints[newPointId].x -= side * kick;
        prevPoints[newPointId].y -= kick * 0.5;
    }

    const mergedRoot = absRagdollPoint(ragdoll, data.root);
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    const scale = rig.size / 32;
    for (let i = 0; i < bCfg.BURST_COUNT; i++) {
        const lifeDur = bCfg.LIFESPAN_MIN + Math.random();
        ragdoll.particles.push({
            x: mergedRoot.x,
            y: mergedRoot.y,
            z: mergedRoot.z,
            vx: (Math.random() - 0.5) * 8 * scale,
            vy: (-5 - Math.random() * 10) * scale,
            vz: (Math.random() - 0.5) * 8 * scale,
            life: lifeDur,
            startLife: lifeDur,
            size: 1.0,
            color: bCfg.PALETTE.ARTERIAL,
            onGround: false,
        });
    }
    ragdoll.emitters.push({ bone: data.root, dir: { x: Math.random() - 0.5, y: -1, z: Math.random() - 0.5 }, life: bCfg.SPRAY_LIFE, scale });
}

/** Split a limb constraint at parameter t (no torso/head mega-fragmentation). */
export function splitBone(ragdoll, boneStartName, t, rig) {
    if (!ragdoll?.points) return null;
    if (!canSplitPart(ragdoll, boneStartName)) return null;

    const basePart = getBasePart(boneStartName);
    if (basePart === "torso" || basePart === "spineTop" || basePart === "spineBot" || basePart === "head") {
        return null;
    }

    const { points, prevPoints, constraints } = ragdoll;
    let searchID = boneStartName;
    if (boneStartName.includes("_fr_")) {
        searchID = boneStartName;
    } else if (PHYSICS_BONE_ALIASES[boneStartName]) {
        searchID = PHYSICS_BONE_ALIASES[boneStartName];
    }

    let constraintIndex = -1;
    let foundConstraint = null;
    if (searchID === "spineTop" && !boneStartName.includes("_fr_")) {
        constraintIndex = constraints.findIndex((c) => c.a === "spineTop" && c.b === "spineBot");
    } else if (searchID === "head" && !boneStartName.includes("_fr_")) {
        constraintIndex = constraints.findIndex((c) => c.a === "head" || c.b === "head");
        if (constraintIndex !== -1) {
            foundConstraint = constraints[constraintIndex];
            if (foundConstraint.b === "head") t = 1.0 - t;
        }
    } else if (boneStartName.includes("_fr_")) {
        constraintIndex = constraints.findIndex((c) => c.a === searchID || c.b === searchID);
        if (constraintIndex !== -1) {
            foundConstraint = constraints[constraintIndex];
            if (foundConstraint.b === searchID) t = 1.0 - t;
        }
    } else {
        constraintIndex = constraints.findIndex((c) => c.a === searchID);
    }
    if (constraintIndex === -1) {
        constraintIndex = constraints.findIndex((c) => c.b === searchID);
        if (constraintIndex !== -1) t = 1.0 - t;
    }
    if (constraintIndex === -1) return null;

    const oldConstraint = constraints[constraintIndex];
    if (oldConstraint.len < 0.1) return null;

    const p1Name = oldConstraint.a;
    const p2Name = oldConstraint.b;
    const abs1 = absRagdollPoint(ragdoll, p1Name);
    const abs2 = absRagdollPoint(ragdoll, p2Name);
    if (!abs1 || !abs2) return null;

    const newPointId = `${basePart}_fr_${Math.floor(Math.random() * 9999)}`;
    ensureSimBone(ragdoll, newPointId, { x: abs1.x + (abs2.x - abs1.x) * t, y: abs1.y + (abs2.y - abs1.y) * t, z: abs1.z + (abs2.z - abs1.z) * t });
    constraints.splice(constraintIndex, 1);
    const newP = absRagdollPoint(ragdoll, newPointId);
    const dist1 = distance(abs1, newP);
    const dist2 = distance(abs2, newP);
    constraints.push({ a: p1Name, b: newPointId, len: dist1 });
    constraints.push({ a: newPointId, b: p2Name, len: dist2 });
    incrementSplitCount(ragdoll, boneStartName);
    return newPointId;
}

export function applyDeathSevers(ragdoll, severList, rig, hitBone = null) {
    for (const limbId of severList || []) {
        if (limbId === "head" && hitBone !== "head") continue;
        severLimb(ragdoll, limbId, rig);
    }
}

/**
 * Damage, fracture, or sever bones after a projectile impulse.
 */
export function processRagdollGoreHit(ragdoll, forceX, forceY, forceZ, hitPart, damageVal, offsetT, rig) {
    if (!ragdoll?.points) return;

    const gCfg = RAGDOLL_CONFIG.GORE;
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    const hCfg = RAGDOLL_CONFIG.HEALTH;

    const cleanType = hitPart.split("_fr_")[0].split("_fracture_")[0];
    const severTarget = resolveSeverTarget(hitPart, ragdoll);

    let healthCategory = "limb";
    if (cleanType === "head" || severTarget === "head") {
        healthCategory = "head";
    } else if (!severTarget && (cleanType.includes("spine") || cleanType === "torso")) {
        healthCategory = "torso";
    }

    const maxHP = hCfg[healthCategory] ?? hCfg.default;
    if (!ragdoll.partHealth) ragdoll.partHealth = {};
    const healthKey = severTarget ?? cleanType;
    if (ragdoll.partHealth[healthKey] === undefined) {
        ragdoll.partHealth[healthKey] = maxHP;
    }

    const totalForce = length({ x: forceX, y: forceY, z: forceZ });
    const forceMultiplier = clamp(totalForce / 5.0, 0, 2.0);
    const damageInflicted = damageVal * (0.5 + forceMultiplier);
    ragdoll.partHealth[healthKey] -= damageInflicted;

    const isHealthDepleted = ragdoll.partHealth[healthKey] <= 0;
    const fragility = gCfg.FRAGILITY[cleanType] ?? gCfg.FRAGILITY[severTarget] ?? 1.0;
    const threshold = gCfg.SEVER_THRESHOLD * fragility;
    const isInstantBreak = totalForce * 0.15 > threshold;
    const canFracture = canSplitPart(ragdoll, hitPart);
    const canSever = !!severTarget && !ragdoll.severed[severTarget];

    if (!isHealthDepleted && !isInstantBreak) {
        const impulseCenter = absRagdollPoint(ragdoll, hitPart) ?? absRagdollPoint(ragdoll, cleanType);
        if (impulseCenter) {
            ragdoll.particles.push({
                x: impulseCenter.x,
                y: impulseCenter.y,
                z: impulseCenter.z,
                vx: Math.random() - 0.5,
                vy: -0.5,
                vz: Math.random() - 0.5,
                life: 0.4,
                startLife: 0.4,
                size: 0.4,
                color: bCfg.PALETTE.VENOUS,
                onGround: false,
            });
        }
        return;
    }

    let action = "NONE";
    const allowSever = canSever && (severTarget !== "head" || cleanType === "head");
    if (allowSever) {
        action = "SEVER";
    } else if (canFracture) {
        action = "FRACTURE";
    }

    if (action === "FRACTURE") {
        const brokenBoneId = splitBone(ragdoll, hitPart, offsetT ?? 0.5, rig);
        if (brokenBoneId) {
            ragdoll.partHealth[brokenBoneId] = maxHP * 0.5;
            const bP = absRagdollPoint(ragdoll, brokenBoneId);
            if (bP) {
                const boneColor = bCfg.PALETTE.BONE ?? "#e8e6d1";
                for (let i = 0; i < 3; i++) {
                    ragdoll.particles.push({
                        x: bP.x,
                        y: bP.y,
                        z: bP.z,
                        vx: (Math.random() - 0.5) * 4,
                        vy: -Math.random() * 4,
                        vz: (Math.random() - 0.5) * 4,
                        life: 0.7,
                        startLife: 0.7,
                        size: 0.5,
                        color: boneColor,
                        onGround: false,
                    });
                }
                ragdoll.particles.push({
                    x: bP.x,
                    y: bP.y,
                    z: bP.z,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1,
                    vz: (Math.random() - 0.5) * 2,
                    life: 1.0,
                    startLife: 1.0,
                    size: 0.6,
                    color: bCfg.PALETTE.ARTERIAL,
                    onGround: false,
                });
            }
        }
    } else if (action === "SEVER") {
        severLimb(ragdoll, severTarget, rig);
    }
}
