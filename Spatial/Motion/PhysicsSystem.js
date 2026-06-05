import { applyRigidBodyImpulse as applyRigidBodyPairImpulse } from "../../Libraries/Motion/rigidBodyImpulse.js";
import { resolveCirclePair } from "../../Libraries/Spatial/collision/circlePair.js";

export class PhysicsSystem {
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
