import { circlesOverlap, findFirstCircleSegmentHit } from "../../Libraries/Spatial/collision/overlap.js";
import { runCollisionPipeline } from "../../Libraries/Spatial/collision/collisionPipeline.js";
import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { getInteractionPairFilter } from "../../Core/interactionPairFilters.js";
/** @type {{ state: object | null, spatialFrame: object | null, events: object[] | null }} */
const collisionRunCtx = { state: null, spatialFrame: null, events: null };
const collisionPipelineHooks = {
    get events() {
        return collisionRunCtx.events;
    },
    get projectiles() {
        return collisionRunCtx.state.projectiles;
    },
    get projectileWorldPropFilter() {
        return getInteractionPairFilter("projectileHitWorldProp");
    },
    onProjectileWallHit(p, segment, events) {
        p.strategy.onWallCollision(p, collisionRunCtx.state, segment, events);
    },
    onProjectileWorldPropHit(p, prop, events) {
        return p.strategy.onWorldPropCollision(p, collisionRunCtx.state, prop, events);
    },
    onProjectileFactionCollisions(p, events) {
        p.resolveFactionCollisions(collisionRunCtx.state, events, collisionRunCtx.spatialFrame);
    },
    resolveWalls(entity, frame) {
        collisionRunCtx.state.wallResolver.resolve(entity, frame);
    },
    combatantRestitution(a, b) {
        const chargeInvolved = a.attackType === "charge" || b.attackType === "charge";
        return chargeInvolved ? 0.65 : 0.15;
    },
    onChargeImpact(charger, other, events) {
        CollisionSystem.applyChargeImpact(charger, other, events);
    },
};
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
        collisionRunCtx.state = state;
        collisionRunCtx.spatialFrame = spatialFrame;
        collisionRunCtx.events = events;
        return runCollisionPipeline(state, spatialFrame, collisionPipelineHooks);
    }
    static applyChargeImpact(charger, other, events) {
        if (getInteractionPairFilter("chargeImpact").allows(charger, other)) events.push({ target: other, damage: getCollisionSettings().chargeImpactDamage ?? 0 });
        charger.changeState("stunned", { timer: 1000, returnState: "charging_prepare" });
    }
}
