import { applyRigidBodyImpulse as applyRigidBodyPairImpulse } from "../../Libraries/Motion/rigidBodyImpulse.js";
import { applyStaticSurfaceImpulse } from "../../Libraries/Motion/staticSurfaceImpulse.js";
import { getCircleSegmentPenetration } from "../../Libraries/Spatial/geometry/WallGeometry.js";
import { resolveCirclePair } from "../../Libraries/Spatial/collision/circlePair.js";
import {
    applyPositionCorrection,
    computeCircleWallContact,
    computePolygonWallContact,
} from "../../Libraries/Spatial/collision/penetration.js";
import { SatCollision } from "../../Libraries/Spatial/collision/SatCollision.js";
import { PolygonShape } from "../../Libraries/Spatial/collision/Shapes.js";

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

        let collided = false;
        for (let i = 0; i < 2; i++) {
            for (const seg of candidateWalls) {
                if (seg.isDead) continue;

                const shape = entity.getShape();
                const radius = shape.getBoundingRadius();
                const maxDist = radius + seg.size * 0.75;
                if (Math.abs(entity.x - seg.x) > maxDist || Math.abs(entity.y - seg.y) > maxDist) continue;

                let normalX;
                let normalY;
                let overlap;
                let satResult = null;

                if (shape.type === "Circle") {
                    const penetration = getCircleSegmentPenetration(entity, seg);
                    if (!penetration) continue;
                    normalX = penetration.normalX;
                    normalY = penetration.normalY;
                    overlap = penetration.overlap;
                } else if (shape.type === "Polygon") {
                    if (!seg.shape) {
                        const half = seg.size / 2;
                        seg.shape = new PolygonShape([
                            { x: -half, y: -half },
                            { x: half, y: -half },
                            { x: half, y: half },
                            { x: -half, y: half },
                        ]);
                    }

                    satResult = SatCollision.checkCollision(entity, shape, seg, seg.shape);
                    if (!satResult) continue;
                    normalX = -satResult.nx;
                    normalY = -satResult.ny;
                    overlap = satResult.overlap;
                } else {
                    continue;
                }

                collided = true;
                applyPositionCorrection(entity, normalX, normalY, overlap);

                const contact = shape.type === "Circle"
                    ? computeCircleWallContact(entity, normalX, normalY, entity.radius)
                    : computePolygonWallContact(entity, normalX, normalY, overlap, satResult);

                const wp = entity.strategy?.wallPhysics;
                const { approachDot } = applyStaticSurfaceImpulse(
                    entity,
                    normalX,
                    normalY,
                    contact.cx,
                    contact.cy,
                    {
                        restitution: wp?.restitution ?? 0.0,
                        friction: wp?.friction ?? 0.9,
                    },
                );

                if (entity.canDamageWalls && state && approachDot < 0) {
                    const impactSpeed = -approachDot;
                    if (impactSpeed > 75) {
                        const ctx = state.fsm ? state.fsm.context : null;
                        if (ctx) {
                            seg.handleHit(10, ctx);
                            entity.vx += 0.25 * impactSpeed * normalX;
                            entity.vy += 0.25 * impactSpeed * normalY;
                        }
                    }
                }
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
