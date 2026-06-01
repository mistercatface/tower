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
    CONSTRAINTS: {
        STIFFNESS: 0.75,
        ITERATIONS: 4,
        JOINT_ANGLES: {
            ELBOW: { min: -2.5, max: 0.1 },
            KNEE: { min: -0.1, max: 2.5 },
            NECK: { min: -0.7, max: 0.7 },
        },
    },
    GORE: {
        FORCE_MULTIPLIER: 0.43,
        SEVER_THRESHOLD: 10,
        MAX_SEVER_COUNT: 0,
    },
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
    const totalWeight = HIT_ZONES.reduce((sum, z) => sum + z.weight, 0);
    let r = Math.random() * totalWeight;
    let hitZone = HIT_ZONES[0];
    for (const zone of HIT_ZONES) {
        if (r < zone.weight) {
            hitZone = zone;
            break;
        }
        r -= zone.weight;
    }
    const yForce = -1.0 - forceMag * 0.15;
    return {
        force: { x: dirX * forceMag, y: yForce, z: dirY * forceMag },
        hitBone: hitZone.id,
        sever: [],
    };
}
