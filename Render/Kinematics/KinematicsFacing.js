/**
 * Single source of truth for body/aim rotation spaces used when building a sprite.
 *
 * - renderRotation: pose + quantized actor.angle (passed to projector + scene begin)
 * - rigAimFacing: reference for arm IK relative to turret world angles
 * - gunCanvasAim: rotation for weapon draw at projected hand (canvas space)
 */
import { normalizeAngle } from "../../Math/Angle.js";
import { blend, ease } from "./KinematicsMath.js";

export function computeFinalRenderRotation(animState, quantizedBodyRotation) {
    const lastBodyOffset = animState.lastStaticPose.rotation?.bodyOffset ?? 0;
    const currentBodyOffset = animState.currentStaticPose.rotation?.bodyOffset ?? 0;
    const sEased = animState.staticBlendFactor * animState.staticBlendFactor;
    const blendedBodyOffset = blend(lastBodyOffset, currentBodyOffset, sEased);
    const t = ease(animState.poseFactor);
    const finalBodyOffset = blend(blendedBodyOffset, 0, t);
    return normalizeAngle(quantizedBodyRotation + finalBodyOffset);
}

export function resolveCombatFacing(actor, animState, quantizedBodyRotation, config) {
    const renderRotation = computeFinalRenderRotation(animState, quantizedBodyRotation);

    return {
        renderRotation,
        /** Arm pose IK: turret aim relative to this facing. */
        rigAimFacing: renderRotation,
        turretWorldAngle(turretIndex = 0) {
            const turrets = actor?.turrets ?? [];
            return normalizeAngle(turrets[turretIndex]?.angle ?? actor?.angle ?? 0);
        },
        /**
         * Weapon mesh rotation at projected hand XY (not rig-local Z).
         * Kept as the original offset formula — guns are drawn in canvas space, not rig-local.
         */
        gunCanvasAim(turretAngle) {
            const aim = turretAngle ?? actor?.angle ?? 0;
            return normalizeAngle(aim + config.BODY_OFFSET - Math.PI);
        },
    };
}
