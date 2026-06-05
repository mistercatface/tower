import { applyRigidBodyImpulse as applyRigidBodyPairImpulse } from "../../Libraries/Motion/rigidBodyImpulse.js";
import { resolveCirclePair } from "../../Libraries/Spatial/collision/circlePair.js";
import { resolveBodyAgainstWallSegments } from "../../Libraries/Spatial/collision/wallResolution.js";

export class PhysicsSystem {
    static resolveWallCollisions(entity, spatialFrame, state) {
        if (entity._wallResolvedFrame === spatialFrame.frameId) {
            return entity._wallResolvedCollided;
        }
        entity._wallResolvedFrame = spatialFrame.frameId;

        const candidateWalls = spatialFrame.getWallCandidates(entity, state);
        if (candidateWalls.length === 0) {
            entity._wallResolvedCollided = false;
            return false;
        }

        const wp = entity.strategy?.wallPhysics;
        const { collided, hits } = resolveBodyAgainstWallSegments(entity, entity.getShape(), candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9 });

        if (entity.canDamageWalls && state) {
            for (const hit of hits) {
                if (hit.approachDot >= 0) continue;
                const impactSpeed = -hit.approachDot;
                if (impactSpeed <= 75) continue;
                const ctx = state.fsm ? state.fsm.context : null;
                if (!ctx) continue;
                hit.segment.handleHit(10, ctx);
                entity.vx += 0.25 * impactSpeed * hit.normalX;
                entity.vy += 0.25 * impactSpeed * hit.normalY;
            }
        }

        entity._wallResolvedCollided = collided;
        return collided;
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
