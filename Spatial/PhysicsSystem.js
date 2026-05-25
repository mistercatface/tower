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
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
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
        let collided = false;

        for (let i = 0; i < 2; i++) {
            for (const seg of segments) {
                if (seg.isDead) continue;

                const dx = entity.x - seg.x;
                const dy = entity.y - seg.y;
                const distanceSq = dx * dx + dy * dy;
                const minDistance = entity.radius + seg.size * 0.5;

                if (distanceSq < minDistance * minDistance) {
                    collided = true;
                    if (distanceSq === 0) {
                        entity.x += minDistance;
                    } else {
                        const distance = Math.sqrt(distanceSq);
                        const overlap = minDistance - distance;
                        const normalX = dx / distance;
                        const normalY = dy / distance;
                        entity.x += normalX * overlap;
                        entity.y += normalY * overlap;

                        const dot = (entity.vx !== undefined && entity.vy !== undefined) ? (entity.vx * normalX + entity.vy * normalY) : 0;

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
                                    entity.vx += 1.5 * impactSpeed * normalX;
                                    entity.vy += 1.5 * impactSpeed * normalY;
                                }
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
