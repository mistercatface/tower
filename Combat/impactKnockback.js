import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { Enemy } from "../Entities/Enemy.js";

/** Default for gun-configured impact knockback when pushSpeedMultiplier is omitted. */
export const defaultGunPushSpeedMultiplier = 3;

export const explosionImpactKnockback = {
    stunMs: 500,
    pushMs: 500,
    pushSpeedMultiplier: 6,
};

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
    PhysicsSystem.resolveWallCollisions(actor, spatialFrame, state);
}

export function repelActorFromExplosion(actor, exp, spatialFrame, state) {
    if (actor.isDead) return;

    const dx = actor.x - exp.x;
    const dy = actor.y - exp.y;
    const dist = Math.hypot(dx, dy);
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
    } else {
        pushX = dx / pushDist;
        pushY = dy / pushDist;
    }

    const overlap = minDist - pushDist;
    if (isNaN(pushX) || isNaN(pushY) || isNaN(overlap)) return;

    actor.x += pushX * overlap;
    actor.y += pushY * overlap;

    applyActorImpactKnockback(actor, Math.atan2(pushY, pushX), explosionImpactKnockback, spatialFrame, state);
}
