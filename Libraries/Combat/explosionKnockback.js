import { addXY, lengthXY, normalizeXY } from "../Math/Vec2.js";
export const explosionImpactKnockback = { stunMs: 500, pushMs: 500, pushSpeedMultiplier: 6 };
function resolveKnockbackReturnState(actor) {
    return actor.attackType === "charge" ? "charging_prepare" : "navigating";
}
function tryApplyExplosionKnockback(actor, pushAngle, spatialFrame, state) {
    if (actor.isDead || actor.faction === "player") return;
    if (actor.currentStateName === "knockedBack") return;
    if (typeof actor.changeState !== "function") return;
    actor.changeState("knockedBack", {
        angle: pushAngle,
        pushMs: explosionImpactKnockback.pushMs,
        stunMs: explosionImpactKnockback.stunMs,
        pushSpeedMultiplier: explosionImpactKnockback.pushSpeedMultiplier,
        returnState: resolveKnockbackReturnState(actor),
    });
    state.wallResolver.resolve(actor, spatialFrame);
}
/** Push combatants out of an expanding blast and apply knockback where supported. */
export function repelActorFromExplosion(actor, exp, spatialFrame, state) {
    if (actor.isDead) return;
    const dx = actor.x - exp.x;
    const dy = actor.y - exp.y;
    const dist = lengthXY(dx, dy);
    if (isNaN(dist)) return;
    const minDist = exp.radius + actor.radius;
    if (isNaN(minDist)) return;
    if (dist >= minDist) return;
    if (!actor.hasLineOfSightFromPoint(exp.x, exp.y, state, { sourceRadius: 0 })) return;
    let pushX;
    let pushY;
    let pushDist = dist;
    if (pushDist === 0) {
        const angle = Math.random() * Math.PI * 2;
        pushX = Math.cos(angle);
        pushY = Math.sin(angle);
        pushDist = 0.1;
    } else ({ nx: pushX, ny: pushY } = normalizeXY(dx, dy));
    const overlap = minDist - pushDist;
    if (isNaN(pushX) || isNaN(pushY) || isNaN(overlap)) return;
    addXY(actor, pushX * overlap, pushY * overlap);
    tryApplyExplosionKnockback(actor, Math.atan2(pushY, pushX), spatialFrame, state);
}
