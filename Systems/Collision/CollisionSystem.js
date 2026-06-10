import { circlesOverlap, findFirstCircleSegmentHit } from "../../Libraries/Spatial/collision/overlap.js";
import { runCollisionPipeline } from "../../Libraries/Spatial/collision/collisionPipeline.js";
import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { getInteractionPairFilter } from "../../Core/interactionPairFilters.js";
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
            projectilePickupFilter: getInteractionPairFilter("projectileHitPickup"),
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
        if (getInteractionPairFilter("chargeImpact").allows(charger, other)) events.push({ target: other, damage: getCollisionSettings().chargeImpactDamage ?? 0 });
        charger.changeState("stunned", { timer: 1000, returnState: "charging_prepare" });
    }
}
