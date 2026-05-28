import { Utilities } from "../Utilities.js";

export class PhysicsSystem {
    static applyMovement(entity, dt, ignoreSeparation = false, shouldMove = true, alignAngleWithMovement = true) {
        let finalX = entity.desiredX + (ignoreSeparation || !entity.separation ? 0 : entity.separation.x);
        let finalY = entity.desiredY + (ignoreSeparation || !entity.separation ? 0 : entity.separation.y);

        const len = Math.hypot(finalX, finalY);
        if (len > 0) {
            finalX /= len;
            finalY /= len;
        }

        if (alignAngleWithMovement) {
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
        } else if (segments.flowFieldGrid) {
            candidateWalls = segments.flowFieldGrid.getNearbySegments(entity);
        }

        let collided = false;
        for (let i = 0; i < 2; i++) {
            for (const seg of candidateWalls) {
                if (seg.isDead) continue;
                const dx = entity.x - seg.x;
                const dy = entity.y - seg.y;
                const maxDist = entity.radius + seg.size * 0.75;
                if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
                const cos = Math.cos(-seg.angle);
                const sin = Math.sin(-seg.angle);
                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;
                const half = seg.size / 2;
                const closestX = Math.max(-half, Math.min(localX, half));
                const closestY = Math.max(-half, Math.min(localY, half));
                const distDX = localX - closestX;
                const distDY = localY - closestY;
                const distanceSq = distDX * distDX + distDY * distDY;
                if (distanceSq < entity.radius * entity.radius) {
                    collided = true;
                    let normalX, normalY, overlap;
                    if (distanceSq === 0) {
                        const distToLeft = localX - -half;
                        const distToRight = half - localX;
                        const distToTop = localY - -half;
                        const distToBottom = half - localY;
                        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                        let localNormX = 0;
                        let localNormY = 0;
                        if (minDist === distToLeft) localNormX = -1;
                        else if (minDist === distToRight) localNormX = 1;
                        else if (minDist === distToTop) localNormY = -1;
                        else localNormY = 1;
                        const invCos = Math.cos(seg.angle);
                        const invSin = Math.sin(seg.angle);
                        normalX = localNormX * invCos - localNormY * invSin;
                        normalY = localNormX * invSin + localNormY * invCos;
                        overlap = entity.radius + minDist;
                    } else {
                        const distance = Math.sqrt(distanceSq);
                        overlap = entity.radius - distance;
                        const localNormX = distDX / distance;
                        const localNormY = distDY / distance;
                        const invCos = Math.cos(seg.angle);
                        const invSin = Math.sin(seg.angle);
                        normalX = localNormX * invCos - localNormY * invSin;
                        normalY = localNormX * invSin + localNormY * invCos;
                    }
                    entity.x += normalX * overlap;
                    entity.y += normalY * overlap;
                    const dot = entity.vx !== undefined && entity.vy !== undefined ? entity.vx * normalX + entity.vy * normalY : 0;
                    if (entity.vx !== undefined && entity.vy !== undefined && dot < 0) {
                        const restitution = entity.type === "barrel" ? 0.25 : 0.0;
                        entity.vx -= (1 + restitution) * dot * normalX;
                        entity.vy -= (1 + restitution) * dot * normalY;
                        const wallFriction = entity.type === "barrel" ? 0.75 : 0.9;
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
