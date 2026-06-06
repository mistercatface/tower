import { normalizeWeaponLoadout } from "../../../Combat/equipmentLoadout.js";
import { quantizeAngleIndex } from "../../Math/Angle.js";
/** @param {Record<string, object>} poses */
export function createEntityAnimState(poses) {
    return {
        pose: "IDLE",
        locomotionLabel: "unarmed_idle",
        currentStaticPose: poses.IDLE,
        lastStaticPose: poses.IDLE,
        staticBlendFactor: 1,
        animCycle: 0,
        lastX: 0,
        lastY: 0,
        smoothedSpeed: 0,
        poseFactor: 0,
        legPoseFactor: 0,
        crouchFactor: 0,
        weaponLoadoutKey: "",
        lastStaticChange: 0,
    };
}
export function getWeaponLoadoutKey(actor) {
    return normalizeWeaponLoadout(actor.weaponLoadout ?? []).join("+") || "none";
}
export function getQuantizedAimKey(actor, rotationSteps = 32) {
    const turrets = actor.turrets ?? [];
    return `${quantizeAngleIndex(turrets[0]?.angle, rotationSteps)}_${quantizeAngleIndex(turrets[1]?.angle, rotationSteps)}`;
}
