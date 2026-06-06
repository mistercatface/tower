import { circlesOverlap, findFirstCircleSegmentHit } from "../../Libraries/Spatial/collision/overlap.js";
import { runCollisionPipeline } from "../../Libraries/Spatial/collision/collisionPipeline.js";
import { enemyDefaults } from "../../Config/Config.js";
import { getCombatPairFilter } from "../../Core/GamePorts.js";

export class CollisionSystem {
    static checkCircle(a, b) {
        return circlesOverlap(a, b);
    }

    static checkCircleRect(circle, rect) {
        return findFirstCircleSegmentHit(circle, [rect]) !== null;
    }

    static getMissileWallCollision(missile, candidateWalls) {
        return findFirstCircleSegmentHit(missile, candidateWalls);
    }

    static run(state, spatialFrame, events = null) {
        return runCollisionPipeline(state, spatialFrame, {
            events,
            projectiles: state.projectiles,
            projectilePickupFilter: getCombatPairFilter("projectileHitPickup"),
            onProjectileWallHit: (p, segment, events) => {
                p.strategy.onWallCollision(p, state, segment, events);
            },
            onProjectilePickupHit: (p, pickup, events) => {
                return p.strategy.onPickupCollision(p, state, pickup, events);
            },
            onProjectileFactionCollisions: (p, events) => {
                p.resolveFactionCollisions(state, events, spatialFrame);
            },
            resolveWalls: (entity, frame) => state.wallResolver.resolve(entity, frame),
            combatantRestitution: (a, b) => {
                const chargeInvolved = a.attackType === "charge" || b.attackType === "charge";
                return chargeInvolved ? 0.65 : 0.15;
            },
            onChargeImpact: (charger, other, events) => {
                CollisionSystem.applyChargeImpact(charger, other, events);
            },
        });
    }

    static applyChargeImpact(charger, other, events) {
        if (getCombatPairFilter("chargeImpact").allows(charger, other)) {
            events.push({ target: other, damage: enemyDefaults.chargeImpactDamage });
        }
        charger.changeState("stunned", { timer: 1000, returnState: "charging_prepare" });
    }
}
