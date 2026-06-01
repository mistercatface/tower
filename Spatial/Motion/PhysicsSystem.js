import { normalizeAngle } from "../../Math/Angle.js";
import { getCircleSegmentPenetration } from "../Geometry/WallGeometry.js";
import { SatCollision } from "../Collision/SatCollision.js";
import { PolygonShape } from "../Geometry/Shapes.js";

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
            angleDiff = normalizeAngle(angleDiff);
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

                let normalX, normalY, overlap;

                if (shape.type === 'Circle') {
                    const penetration = getCircleSegmentPenetration(entity, seg);
                    if (!penetration) continue;
                    normalX = penetration.normalX;
                    normalY = penetration.normalY;
                    overlap = penetration.overlap;
                } else if (shape.type === 'Polygon') {
                    if (!seg.shape) {
                        const half = seg.size / 2;
                        seg.shape = new PolygonShape([
                            { x: -half, y: -half },
                            { x: half, y: -half },
                            { x: half, y: half },
                            { x: -half, y: half }
                        ]);
                    }

                    const coll = SatCollision.checkCollision(entity, shape, seg, seg.shape);
                    if (!coll) continue;
                    normalX = -coll.nx;
                    normalY = -coll.ny;
                    overlap = coll.overlap;
                } else {
                    continue;
                }

                collided = true;
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
        entity._wallResolvedCollided = collided;
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

    static resolveCircleCollision(a, b, { restitution = 0.5 } = {}) {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist >= minDist) return false;

        let normalX;
        let normalY;
        if (dist < 0.001) {
            const angle = Math.random() * Math.PI * 2;
            normalX = Math.cos(angle);
            normalY = Math.sin(angle);
        } else {
            normalX = dx / dist;
            normalY = dy / dist;
        }

        const overlap = minDist - dist;
        const massA = a.mass ?? a.radius ?? 1;
        const massB = b.mass ?? b.radius ?? 1;
        const totalMass = massA + massB;

        a.x -= normalX * overlap * (massB / totalMass);
        a.y -= normalY * overlap * (massB / totalMass);
        b.x += normalX * overlap * (massA / totalMass);
        b.y += normalY * overlap * (massA / totalMass);

        a._wallResolvedFrame = null;
        b._wallResolvedFrame = null;

        const avx = a.vx ?? 0;
        const avy = a.vy ?? 0;
        const bvx = b.vx ?? 0;
        const bvy = b.vy ?? 0;
        const rvx = bvx - avx;
        const rvy = bvy - avy;
        const velAlongNormal = rvx * normalX + rvy * normalY;

        if (velAlongNormal >= 0) return true;

        const impulseScalar = -(1 + restitution) * velAlongNormal / ((1 / massA) + (1 / massB));

        if (a.vx !== undefined) {
            a.vx = avx - (impulseScalar / massA) * normalX;
            a.vy = avy - (impulseScalar / massA) * normalY;
        }
        if (b.vx !== undefined) {
            b.vx = bvx + (impulseScalar / massB) * normalX;
            b.vy = bvy + (impulseScalar / massB) * normalY;
        }

        return true;
    }
}
