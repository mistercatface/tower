/**
 * Single source of truth for body/aim rotation spaces used when building a sprite.
 *
 * - renderRotation: pose + quantized actor.angle (passed to projector + scene begin)
 * - rigAimFacing: reference for arm IK relative to turret world angles
 * - gunCanvasAim: rotation for weapon draw at projected hand (canvas space)
 */
import { angleDelta, normalizeAngle } from "../../Libraries/Math/Angle.js";
import { smootherstep } from "../../Libraries/Math/Easing.js";
import { lerp } from "../../Libraries/Math/Interpolate.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";

/** First turret with a live hostile target (auto-aim lock). */
export function getPrimaryCombatTurret(actor) {
    const turrets = actor?.turrets ?? [];
    for (const turret of turrets) {
        if (turret?.target && !turret.target.isDead) return turret;
    }
    return turrets[0] ?? null;
}

/**
 * Rotation used to build the kinematics sprite.
 * While auto-aiming, match the aiming turret so arms/guns agree with the target.
 * Otherwise use movement facing (actor.angle).
 */
export function resolveSpriteBodyRotation(actor) {
    const base = actor?.angle ?? 0;
    const loadout = normalizeWeaponLoadout(actor?.weaponLoadout ?? []);
    if (loadout.length === 0) return base;

    const turret = getPrimaryCombatTurret(actor) ?? actor.turrets?.[0];
    if (!turret) return base;
    const turretAngle = normalizeAngle(turret.angle);

    if (turret.target && !turret.target.isDead) {
        return turretAngle;
    }

    // After combat / recoil skid: body and gun can disagree briefly — keep sprite on the barrel.
    if (Math.abs(angleDelta(base, turretAngle)) > 0.5) {
        return turretAngle;
    }
    return base;
}

export function computeFinalRenderRotation(animState, quantizedBodyRotation) {
    const lastBodyOffset = animState.lastStaticPose.rotation?.bodyOffset ?? 0;
    const currentBodyOffset = animState.currentStaticPose.rotation?.bodyOffset ?? 0;
    const sEased = animState.staticBlendFactor * animState.staticBlendFactor;
    const blendedBodyOffset = lerp(lastBodyOffset, currentBodyOffset, sEased);
    const t = smootherstep(animState.poseFactor);
    const finalBodyOffset = lerp(blendedBodyOffset, 0, t);
    return normalizeAngle(quantizedBodyRotation + finalBodyOffset);
}

export function resolveCombatFacing(actor, animState, quantizedBodyRotation, config) {
    const renderRotation = computeFinalRenderRotation(animState, quantizedBodyRotation);

    return {
        renderRotation,
        /** Arm IK base facing — same as sprite body (turret lock-on or movement). */
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
