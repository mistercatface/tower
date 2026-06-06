export function createKinematicsConfig(pixelSize) {
    return Object.freeze({
        STRIDE_SPEED: 5.0,
        IDLE_SPEED: 2.0,
        WALK_PLAYBACK_SCALE: 0.72,
        WALK_DIR: 1,
        BODY_OFFSET: Math.PI,
        SIZE: pixelSize,
        ANCHOR_Y: 0.9,
        PADDING: 120,
        HEAD_R: 0.15,
        TORSO_W: 0.25,
        TORSO_D: 0.15,
        TORSO_H: 0.25,
        HIP_W: 0.12,
        ARM_L1: 0.13,
        ARM_L2: 0.12,
        ARM_R1: 0.13,
        ARM_R2: 0.12,
        ARM_FLARE: 0.04,
        LEG_L1: 0.15,
        LEG_L2: 0.15,
        LEG_FLARE: 0.0,
        LEAN_MULTIPLIER: 0.4,
        HAND_R: 0.04,
        // Perspective projection constants
        PERSPECTIVE_MIN_Y: 0.1,
        PERSPECTIVE_MAX_Y: 0.8,
        PERSPECTIVE_HEIGHT: 1.0,
        PERSPECTIVE_Z_CLAMP: 0.6,
        PERSPECTIVE_SCALE_BASE: 0.9,
        PERSPECTIVE_SCALE_RANGE: 0.5,
    });
}
export function createKinematicsRig(config) {
    const legLength = config.SIZE * (config.LEG_L1 + config.LEG_L2);
    const baseShoulderY = config.SIZE * (0.25 + 0.09 + 0.05);
    const standingHipY = baseShoulderY + config.SIZE * config.TORSO_H;
    const groundY = standingHipY + legLength;
    return Object.freeze({
        size: config.SIZE,
        legLength,
        baseShoulderY,
        standingHipY,
        groundY,
        torsoHalfWidth: config.SIZE * config.TORSO_W * 0.5,
        hipHalfWidth: config.SIZE * config.HIP_W * 0.5,
        armL1: config.SIZE * config.ARM_L1,
        armL2: config.SIZE * config.ARM_L2,
        armFlare: config.SIZE * config.ARM_FLARE,
        legL1: config.SIZE * config.LEG_L1,
        legL2: config.SIZE * config.LEG_L2,
        legFlare: config.SIZE * config.LEG_FLARE,
        headR: config.SIZE * config.HEAD_R,
        handR: config.SIZE * config.HAND_R,
        torsoH: config.SIZE * config.TORSO_H,
    });
}
