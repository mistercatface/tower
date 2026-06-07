/**
 * Body/aim rotation spaces used when building a kinematics sprite.
 */
import { angleDelta, normalizeAngle } from "../../Math/Angle.js";
import { smootherstep } from "../../Math/Easing.js";
import { lerp } from "../../Math/Interpolate.js";
export function getPrimaryCombatTurret(actor) {
    const turrets = actor?.turrets ?? [];
    for (const turret of turrets) if (turret?.target && !turret.target.isDead) return turret;
    return turrets[0] ?? null;
}
export function resolveSpriteBodyRotation(actor) {
    const base = actor?.angle ?? 0;
    const loadout = actor?.weaponLoadout ?? [];
    if (loadout.length === 0) return base;
    const turret = getPrimaryCombatTurret(actor) ?? actor.turrets?.[0];
    if (!turret) return base;
    const turretAngle = normalizeAngle(turret.angle);
    if (turret.target && !turret.target.isDead) return turretAngle;
    if (Math.abs(angleDelta(base, turretAngle)) > 0.5) return turretAngle;
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
        rigAimFacing: renderRotation,
        turretWorldAngle(turretIndex = 0) {
            const turrets = actor?.turrets ?? [];
            return normalizeAngle(turrets[turretIndex]?.angle ?? actor?.angle ?? 0);
        },
        gunCanvasAim(turretAngle) {
            const aim = turretAngle ?? actor?.angle ?? 0;
            return normalizeAngle(aim + config.BODY_OFFSET - Math.PI);
        },
    };
}
