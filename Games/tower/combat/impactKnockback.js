import { Enemy } from "../entities/Enemy.js";
import { addXY, lengthXY, normalizeXY } from "../../../Libraries/Math/Vec2.js";
import { explosionImpactKnockback, repelActorFromExplosion } from "../../../Libraries/Combat/explosionKnockback.js";
/** Default for gun-configured impact knockback when pushSpeedMultiplier is omitted. */
export const defaultGunPushSpeedMultiplier = 3;
export { explosionImpactKnockback, repelActorFromExplosion };
export function resolveKnockbackReturnState(actor) {
    return actor.attackType === "charge" ? "charging_prepare" : "navigating";
}
export function applyActorImpactKnockback(actor, pushAngle, config, spatialFrame, state) {
    if (actor.isDead || !(actor instanceof Enemy)) return;
    if (actor.currentStateName === "knockedBack") return;
    actor.changeState("knockedBack", {
        angle: pushAngle,
        pushMs: config.pushMs,
        stunMs: config.stunMs,
        pushSpeedMultiplier: config.pushSpeedMultiplier ?? defaultGunPushSpeedMultiplier,
        returnState: config.returnState ?? resolveKnockbackReturnState(actor),
    });
    state.wallResolver.resolve(actor, spatialFrame);
}
