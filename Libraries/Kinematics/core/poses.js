import { defaultStaticPoseDefs } from "./defaultStaticPoses.js";
import { buildStaticPoses } from "./staticPoseBuilder.js";

/**
 * @param {object} config
 * @param {object} rig
 */
export function createKinematicsPoses(config, rig) {
    const walk = {
        name: "WALK",
        getTargets(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * -config.WALK_DIR;
            const swingDist = rig.size * 0.08;
            const stepHeight = rig.size * 0.12;
            const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
            const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
            return {
                rightFoot: { x: fSwing * swingDist, y: rig.groundY - rLift },
                leftFoot: { x: -fSwing * swingDist, y: rig.groundY - lLift },
            };
        },
        getModifiers(cycle) {
            return { lift: 0, lean: 0, bob: Math.cos(cycle * 2) * (rig.size * 0.02) };
        },
        getArmAngles(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * config.WALK_DIR;
            const range = 0.8;
            return {
                rArm: -(fSwing * range),
                lArm: fSwing * range,
                rElbow: -(fSwing * range) - 0.3,
                lElbow: fSwing * range - 0.3,
            };
        },
    };

    const sneak = {
        name: "SNEAK",
        getArmAngles(cycle) {
            const sway = Math.sin(cycle) * 0.1;
            return {
                rArm: 0.2 + sway,
                lArm: 0.2 - sway,
                rElbow: -0.5,
                lElbow: -0.5,
                rArmZ: 0.2,
                lArmZ: 0.2,
                rElbowZ: 0,
                lElbowZ: 0,
            };
        },
        getModifiers(cycle) {
            return {
                lift: -0.15 * rig.size,
                lean: 0.2 + Math.sin(cycle) * 0.02,
                bob: Math.cos(cycle * 2) * (rig.size * 0.01),
            };
        },
        getTargets(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * (-config.WALK_DIR || 1);
            const swingDist = rig.size * 0.1;
            const stepHeight = rig.size * 0.1;
            const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
            const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
            return {
                rightFoot: { x: fSwing * swingDist, y: rig.groundY - rLift },
                leftFoot: { x: -fSwing * swingDist, y: rig.groundY - lLift },
            };
        },
    };

    return {
        WALK: walk,
        SNEAK: sneak,
        ...buildStaticPoses(defaultStaticPoseDefs, rig),
    };
}
