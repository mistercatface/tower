import { applyRigidBodyImpulse as applyRigidBodyPairImpulse } from "../../Libraries/Motion/rigidBodyImpulse.js";
import { resolveWallCollisions as resolveWallCollisionsLib } from "../../Libraries/Motion/wallCollision.js";
import { resolveCirclePair } from "../../Libraries/Spatial/collision/circlePair.js";

/**
 * @param {object} entity
 * @param {object} hit
 * @param {object | null} state
 */
function applyWallDamageHit(entity, hit, state) {
    if (!entity.canDamageWalls || !state) return;
    if (hit.approachDot >= 0) return;
    const impactSpeed = -hit.approachDot;
    if (impactSpeed <= 75) return;
    const ctx = state.fsm ? state.fsm.context : null;
    if (!ctx) return;
    hit.segment.handleHit(10, ctx);
    entity.vx += 0.25 * impactSpeed * hit.normalX;
    entity.vy += 0.25 * impactSpeed * hit.normalY;
}

export class PhysicsSystem {
    static resolveWallCollisions(entity, spatialFrame, state) {
        const onWallDamage = entity.canDamageWalls && state ? (hit) => applyWallDamageHit(entity, hit, state) : null;
        return resolveWallCollisionsLib(entity, spatialFrame, { onWallDamage });
    }

    static applyRigidBodyImpulse(p1, p2, collisionInfo, restitution = 0.15) {
        applyRigidBodyPairImpulse(p1, p2, collisionInfo, restitution);
    }

    static resolveCircleCollision(a, b, options) {
        const collided = resolveCirclePair(a, b, options);
        if (collided) {
            a._wallResolvedFrame = null;
            b._wallResolvedFrame = null;
        }
        return collided;
    }
}
