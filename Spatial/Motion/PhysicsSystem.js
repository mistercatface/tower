import { Utilities } from "../../Core/Utilities.js";
import { getCircleSegmentPenetration } from "../Navigation/WallGeometry.js";

export class PhysicsSystem {
    static applyMovement(entity, dt, ignoreSeparation = false, shouldMove = true, alignAngleWithMovement = true) {
        let finalX = entity.desiredX + (ignoreSeparation || !entity.separation ? 0 : entity.separation.x);
        let finalY = entity.desiredY + (ignoreSeparation || !entity.separation ? 0 : entity.separation.y);

        const len = Math.hypot(finalX, finalY);
        if (len > 0) {
            finalX /= len;
            finalY /= len;
        }

        if (alignAngleWithMovement && len > 0) {
            const targetAngle = Math.atan2(finalY, finalX);
            let angleDiff = targetAngle - entity.angle;
            angleDiff = Utilities.normalizeAngle(angleDiff);
            entity.angle += angleDiff * Math.min(1, entity.turnSpeed * (dt / 1000));
        }

        if (shouldMove) {
            const targetVx = len > 0 ? finalX * entity.speed : 0;
            const targetVy = len > 0 ? finalY * entity.speed : 0;
            const accelRate = entity.accelRate;
            const t = 1 - Math.exp(-accelRate * (dt / 1000));
            entity.vx += (targetVx - entity.vx) * t;
            entity.vy += (targetVy - entity.vy) * t;
            entity.x += entity.vx * (dt / 1000);
            entity.y += entity.vy * (dt / 1000);
            if (entity.separation) {
                entity.x += entity.separation.pushX;
                entity.y += entity.separation.pushY;
            }
        }
    }

    static resolveWallCollisions(entity, segments, state = null) {
        if (!segments) return false;

        let candidateWalls = segments;
        if (segments.spatialHash) {
            candidateWalls = segments.spatialHash.getNearby(entity);
        } else if (segments.obstacleGrid) {
            candidateWalls = segments.obstacleGrid.getNearbySegments(entity);
        }

        let collided = false;
        for (let i = 0; i < 2; i++) {
            for (const seg of candidateWalls) {
                if (seg.isDead) continue;
                const maxDist = entity.radius + seg.size * 0.75;
                if (Math.abs(entity.x - seg.x) > maxDist || Math.abs(entity.y - seg.y) > maxDist) continue;

                const penetration = getCircleSegmentPenetration(entity, seg);
                if (!penetration) continue;

                collided = true;
                const { normalX, normalY, overlap } = penetration;
                entity.x += normalX * overlap;
                entity.y += normalY * overlap;
                const dot = entity.vx !== undefined && entity.vy !== undefined ? entity.vx * normalX + entity.vy * normalY : 0;
                if (entity.vx !== undefined && entity.vy !== undefined && dot < 0) {
                    const wp = entity.strategy?.wallPhysics;
                    const restitution = wp?.restitution ?? 0.0;
                    entity.vx -= (1 + restitution) * dot * normalX;
                    entity.vy -= (1 + restitution) * dot * normalY;
                    const wallFriction = wp?.friction ?? 0.9;
                    const tx = -normalY;
                    const ty = normalX;
                    const tangentDot = entity.vx * tx + entity.vy * ty;
                    entity.vx = tx * tangentDot * wallFriction;
                    entity.vy = ty * tangentDot * wallFriction;
                }
                if (entity.canDamageWalls && state && dot < 0) {
                    const impactSpeed = -dot;
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
        return collided;
    }

    static applyFrictionAndDrag(entity, dt, friction = 8.0) {
        if (entity.vx || entity.vy) {
            entity.x += entity.vx * (dt / 1000);
            entity.y += entity.vy * (dt / 1000);
            const dragFactor = Math.exp(-friction * (dt / 1000));
            entity.vx *= dragFactor;
            entity.vy *= dragFactor;
            if (Math.hypot(entity.vx, entity.vy) < 1) {
                entity.vx = 0;
                entity.vy = 0;
            }
        }
    }

    static applyImpulse(entity, fx, fy) {
        if (entity.vx === undefined || entity.vy === undefined) return;
        const mass = entity.mass || 1.0;
        entity.vx += fx / mass;
        entity.vy += fy / mass;
    }

    static applyKnockback(entity, angle, magnitude) {
        const fx = Math.cos(angle) * magnitude;
        const fy = Math.sin(angle) * magnitude;
        this.applyImpulse(entity, fx, fy);
    }
}
