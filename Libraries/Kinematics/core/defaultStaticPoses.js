/** @typedef {import("./staticPoseBuilder.js").StaticPoseDef} StaticPoseDef */
const HALF_PI = Math.PI / 2;
/** Default static upper-body poses — keyed by resolveWeaponStaticPoseName(). */
/** @type {Record<string, StaticPoseDef>} */
export const defaultStaticPoseDefs = {
    IDLE: {
        feet: { spreadX: 0.015 },
        body: { leanRange: 0.02, bobRange: 0.008, bobSpeed: 1.5, leanSpeed: 0.5 },
        arms: { rArm: { base: 0, swaySpeed: 0.75, swayAmp: 0.15 }, lArm: { base: 0, swaySpeed: 0.75, swayAmp: -0.15 }, rElbow: -0.2, lElbow: -0.2 },
    },
    PISTOL: {
        feet: { rightOffsetX: 0.1, leftOffsetX: -0.05 },
        body: { leanBase: -0.05, bobRange: 0.005, bobSpeed: 1.5 },
        arms: { lArm: { base: -HALF_PI, swaySpeed: 0.5, swayAmp: -0.05 }, lElbow: -HALF_PI, rArm: { base: 0.1, swaySpeed: 0.5, swayAmp: 0.05 }, rElbow: -0.1 },
    },
    DUAL_WIELD: {
        feet: { rightOffsetX: 0.08, leftOffsetX: -0.08 },
        body: { leanBase: -0.04, bobRange: 0.005, bobSpeed: 1.5 },
        arms: { rArm: { base: -HALF_PI, swaySpeed: 0.5, swayAmp: 0.05 }, rElbow: -HALF_PI, lArm: { base: -HALF_PI, swaySpeed: 0.5, swayAmp: -0.05 }, lElbow: -HALF_PI },
    },
    SHOTGUN: {
        feet: { rightOffsetX: 0.07, leftOffsetX: -0.072 },
        body: { lift: -0.035, leanBase: 0.18, leanRange: 0.02, bobRange: 0.008, bobSpeed: 1.5 },
        arms: {
            lArm: { base: -1.342, swaySpeed: 0.5, swayAmp: -0.05 },
            lElbow: -1.442,
            rArm: { base: -1.322, swaySpeed: 0.5, swayAmp: 0.05 },
            rElbow: -1.322,
            lArmZ: 0.398,
            lElbowZ: 0.128,
            rArmZ: 0.378,
            rElbowZ: 0.198,
        },
    },
};
