import { weightedPick } from "../../Random/weightedPick.js";
export const RAGDOLL_CONFIG = {
    PHYSICS: {
        GRAVITY: 0.5,
        AIR_DRAG: 0.95,
        GROUND_FRICTION: 0.9,
        WALL_BOUNCE: 0.5,
        WALL_FRICTION: 0.5,
        SPEED_CAP: 3.5,
        COLLISION_STEPS: 3,
        IMPACT_DISTRIBUTION: 0.4,
        CHAOS: 0.2,
        VELOCITY_SCALER: 0.35,
    },
    CONSTRAINTS: { STIFFNESS: 0.75, ITERATIONS: 4, JOINT_ANGLES: { ELBOW: { min: -2.5, max: 0.1 }, KNEE: { min: -0.1, max: 2.5 }, NECK: { min: -0.7, max: 0.7 } } },
    GORE: {
        FORCE_MULTIPLIER: 0.43,
        SEVER_THRESHOLD: 6,
        MAX_SEVER_COUNT: 3,
        CASCADE_CHANCE: 0.65,
        CASCADE_DECAY: 0.6,
        FRAGILITY: { head: 0.75, rArm: 1.0, lArm: 1.0, rLeg: 0.9, lLeg: 0.9 },
        MAX_SPLITS: { head: 2, torso: 2, limb: 3 },
    },
    BLOOD: {
        BURST_COUNT: 12,
        SPRAY_LIFE: 5.5,
        GRAVITY: 1.4,
        DRAG: 0.97,
        LIFESPAN_MIN: 4.0,
        LIFESPAN_MAX: 8.0,
        DROP_SIZE: 0.014,
        SPLAT_SIZE: 1.2,
        MAX_PARTICLES: 500,
        MAX_STAINS: 56,
        GROUND_FADE: 0.1,
        PALETTE: { ARTERIAL: "#ad0000", VENOUS: "#8a0000", DRIED: "#4a0000", BONE: "#e8e6d1", MARROW: "#5c1818" },
    },
    HEALTH: { head: 35, torso: 45, limb: 12, default: 12 },
};
export const DAMAGE_NEIGHBORS = {
    head: ["spineTop"],
    spineTop: ["head", "rArm", "lArm", "spineBot"],
    spineBot: ["spineTop", "rHip", "lHip"],
    rShoulder: ["spineTop", "rArm"],
    lShoulder: ["spineTop", "lArm"],
    rArm: ["rShoulder"],
    lArm: ["lShoulder"],
    rHip: ["spineBot", "rLeg"],
    lHip: ["spineBot", "lLeg"],
    rLeg: ["rHip"],
    lLeg: ["lHip"],
};
export const SEVER_MAP = {
    head: "head",
    rShoulder: "rArm",
    rArm: "rArm",
    rElbow: "rForearm",
    rForearm: "rForearm",
    rHand: "rForearm",
    lShoulder: "lArm",
    lArm: "lArm",
    lElbow: "lForearm",
    lForearm: "lForearm",
    lHand: "lForearm",
    rHip: "rLeg",
    rLeg: "rLeg",
    rKnee: "rShin",
    rShin: "rShin",
    rFoot: "rShin",
    lHip: "lLeg",
    lLeg: "lLeg",
    lKnee: "lShin",
    lShin: "lShin",
    lFoot: "lShin",
};
const HIT_ZONES = [
    { id: "head", weight: 15 },
    { id: "spineTop", weight: 20 },
    { id: "spineBot", weight: 15 },
    { id: "rShoulder", weight: 20 },
    { id: "lShoulder", weight: 20 },
    { id: "rHip", weight: 15 },
    { id: "lHip", weight: 15 },
];
export function getScaledPhysics(pixelSize) {
    const scale = pixelSize / 32;
    const base = RAGDOLL_CONFIG.PHYSICS;
    return {
        GRAVITY: base.GRAVITY * scale,
        AIR_DRAG: base.AIR_DRAG,
        GROUND_FRICTION: base.GROUND_FRICTION,
        WALL_BOUNCE: base.WALL_BOUNCE,
        WALL_FRICTION: base.WALL_FRICTION,
        SPEED_CAP: base.SPEED_CAP * scale,
        COLLISION_STEPS: base.COLLISION_STEPS,
        IMPACT_DISTRIBUTION: base.IMPACT_DISTRIBUTION,
        CHAOS: base.CHAOS * scale,
        VELOCITY_SCALER: base.VELOCITY_SCALER,
    };
}
export function createImpactProfile(dirX, dirY, power = 1) {
    const gCfg = RAGDOLL_CONFIG.GORE;
    const forceMag = power * gCfg.FORCE_MULTIPLIER;
    const hitZone = weightedPick(HIT_ZONES, (zone) => zone.weight) ?? HIT_ZONES[0];
    const severedLimbs = new Set();
    const processingQueue = [{ id: hitZone.id, force: power, depth: 0 }];
    let safetyBreaker = 0;
    while (processingQueue.length > 0 && severedLimbs.size < gCfg.MAX_SEVER_COUNT && safetyBreaker < 20) {
        safetyBreaker++;
        const current = processingQueue.shift();
        const limbId = SEVER_MAP[current.id];
        if (limbId && !severedLimbs.has(limbId)) {
            if (limbId === "head" && current.id !== "head") continue;
            const fragility = gCfg.FRAGILITY[limbId] ?? 1.0;
            const threshold = gCfg.SEVER_THRESHOLD * fragility;
            if (current.force > threshold) severedLimbs.add(limbId);
        }
        if (current.force > 4 && current.depth < 2) {
            const neighbors = DAMAGE_NEIGHBORS[current.id] || [];
            for (const neighborId of neighbors) if (Math.random() < gCfg.CASCADE_CHANCE) processingQueue.push({ id: neighborId, force: current.force * gCfg.CASCADE_DECAY, depth: current.depth + 1 });
        }
    }
    const yForce = -1.0 - forceMag * 0.15;
    return { force: { x: dirX * forceMag, y: yForce, z: dirY * forceMag }, hitBone: hitZone.id, sever: Array.from(severedLimbs) };
}
