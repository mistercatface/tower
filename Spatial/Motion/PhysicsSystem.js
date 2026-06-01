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

                let normalX, normalY, overlap, coll;

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

                    coll = SatCollision.checkCollision(entity, shape, seg, seg.shape);
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

                let cx, cy;
                if (shape.type === 'Circle') {
                    cx = entity.x - normalX * entity.radius;
                    cy = entity.y - normalY * entity.radius;
                } else {
                    cx = coll.cx !== undefined ? coll.cx : entity.x - normalX * overlap;
                    cy = coll.cy !== undefined ? coll.cy : entity.y - normalY * overlap;
                }

                const rx = cx - entity.x;
                const ry = cy - entity.y;
                const w = entity.angularVelocity || 0;

                const vpx = (entity.vx || 0) - w * ry;
                const vpy = (entity.vy || 0) + w * rx;
                
                const dot = vpx * normalX + vpy * normalY;

                if (entity.vx !== undefined && entity.vy !== undefined && dot < 0) {
                    const wp = entity.strategy?.wallPhysics;
                    const restitution = wp?.restitution ?? 0.0;
                    
                    const invMassVal = entity.mass ? (1 / entity.mass) : (entity.radius ? 1 / entity.radius : 1/15);
                    const invI = entity.momentOfInertia ? 1 / entity.momentOfInertia : 0;
                    
                    const cross = rx * normalY - ry * normalX;
                    const denom = invMassVal + cross * cross * invI;
                    const j = -(1 + restitution) * dot / denom;
                    
                    entity.vx -= j * normalX * invMassVal;
                    entity.vy -= j * normalY * invMassVal;
                    if (entity.momentOfInertia) {
                        entity.angularVelocity -= j * cross * invI;
                    }
                    
                    // Friction
                    const wallFriction = wp?.friction ?? 0.9;
                    const tx = -normalY;
                    const ty = normalX;
                    
                    const wNew = entity.angularVelocity || 0;
                    const vpxNew = entity.vx - wNew * ry;
                    const vpyNew = entity.vy + wNew * rx;
                    
                    const tangentDot = vpxNew * tx + vpyNew * ty;
                    
                    const crossT = rx * ty - ry * tx;
                    const denomT = invMassVal + crossT * crossT * invI;
                    const jt = -tangentDot * (1 - wallFriction) / denomT;
                    
                    entity.vx += jt * tx * invMassVal;
                    entity.vy += jt * ty * invMassVal;
                    if (entity.momentOfInertia) {
                        entity.angularVelocity += jt * crossT * invI;
                    }
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
        if (entity.angularVelocity) {
            entity.facing = (entity.facing || 0) + entity.angularVelocity * (dt / 1000);
            const angularDrag = Math.exp(-friction * 0.8 * (dt / 1000));
            entity.angularVelocity *= angularDrag;
            if (Math.abs(entity.angularVelocity) < 0.1) {
                entity.angularVelocity = 0;
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

    static applyRigidBodyImpulse(p1, p2, collisionInfo, restitution = 0.15) {
        const nx = collisionInfo.nx;
        const ny = collisionInfo.ny;
        const cx = collisionInfo.cx !== undefined ? collisionInfo.cx : p1.x + nx * (collisionInfo.overlap / 2);
        const cy = collisionInfo.cy !== undefined ? collisionInfo.cy : p1.y + ny * (collisionInfo.overlap / 2);

        const rx1 = cx - p1.x;
        const ry1 = cy - p1.y;
        const rx2 = cx - p2.x;
        const ry2 = cy - p2.y;

        const w1 = p1.angularVelocity || 0;
        const w2 = p2.angularVelocity || 0;

        const v1x = (p1.vx || 0) - w1 * ry1;
        const v1y = (p1.vy || 0) + w1 * rx1;
        const v2x = (p2.vx || 0) - w2 * ry2;
        const v2y = (p2.vy || 0) + w2 * rx2;

        const rvx = v2x - v1x;
        const rvy = v2y - v1y;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal >= 0) return;

        const m1 = p1.mass !== undefined ? p1.mass : (p1.radius || 15);
        const m2 = p2.mass !== undefined ? p2.mass : (p2.radius || 15);
        const invMass1 = 1 / m1;
        const invMass2 = 1 / m2;

        // Actors generally don't spin from physics, so momentOfInertia might be undefined for them.
        const invI1 = p1.momentOfInertia ? 1 / p1.momentOfInertia : 0;
        const invI2 = p2.momentOfInertia ? 1 / p2.momentOfInertia : 0;

        const cross1 = (rx1 * ny - ry1 * nx);
        const cross2 = (rx2 * ny - ry2 * nx);

        const denom = invMass1 + invMass2 + cross1 * cross1 * invI1 + cross2 * cross2 * invI2;
        const j = -(1 + restitution) * velAlongNormal / denom;

        if (p1.vx !== undefined) p1.vx -= j * nx * invMass1;
        if (p1.vy !== undefined) p1.vy -= j * ny * invMass1;
        if (p1.momentOfInertia) p1.angularVelocity -= j * cross1 * invI1;

        if (p2.vx !== undefined) p2.vx += j * nx * invMass2;
        if (p2.vy !== undefined) p2.vy += j * ny * invMass2;
        if (p2.momentOfInertia) p2.angularVelocity += j * cross2 * invI2;
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
