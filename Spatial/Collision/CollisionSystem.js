import { circleIntersectsSegment } from "../Geometry/WallGeometry.js";
import { areHostile } from "../../Combat/Targeting.js";
import { PhysicsSystem } from "../Motion/PhysicsSystem.js";
import { enemyDefaults } from "../../Config/Config.js";
import { Actor } from "../../Entities/Actor.js";

export class CollisionSystem {
    static checkCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        return dist < a.radius + b.radius;
    }

    static checkCircleRect(circle, rect) {
        return circleIntersectsSegment(circle, rect);
    }

    static getMissileWallCollision(missile, candidateWalls) {
        if (!candidateWalls || candidateWalls.length === 0) return null;

        const missileRad = missile.radius;
        for (const seg of candidateWalls) {
            if (seg.isDead) continue;
            const dx = missile.x - seg.x;
            const dy = missile.y - seg.y;
            const maxDist = missileRad + seg.size * 0.75;
            if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
            if (this.checkCircleRect(missile, seg)) return seg;
        }
        return null;
    }

    static resolveActorPushable(actor, pickup) {
        const dx = pickup.x - actor.x;
        const dy = pickup.y - actor.y;
        const dist = Math.hypot(dx, dy);
        const minDist = actor.radius + pickup.radius;

        if (dist >= minDist) return;

        let pushX;
        let pushY;
        let pushDist = dist;
        if (pushDist === 0) {
            const angle = Math.random() * Math.PI * 2;
            pushX = Math.cos(angle);
            pushY = Math.sin(angle);
            pushDist = 0.1;
        } else {
            pushX = dx / pushDist;
            pushY = dy / pushDist;
        }

        const overlap = minDist - pushDist;

        const actorMass = actor.mass !== undefined ? actor.mass : actor.radius;
        const pickupMass = pickup.mass !== undefined ? pickup.mass : 1.0;
        const totalMass = actorMass + pickupMass;

        const actorShift = overlap * (pickupMass / totalMass);
        const pickupShift = overlap * (actorMass / totalMass);

        actor.x -= pushX * actorShift;
        actor.y -= pushY * actorShift;
        pickup.x += pushX * pickupShift;
        pickup.y += pushY * pickupShift;

        const rvx = (pickup.vx || 0) - (actor.vx || 0);
        const rvy = (pickup.vy || 0) - (actor.vy || 0);
        const velAlongNormal = rvx * pushX + rvy * pushY;

        if (velAlongNormal < 0) {
            const restitution = 0.15;
            const impulseScalar = -(1 + restitution) * velAlongNormal / ((1 / actorMass) + (1 / pickupMass));

            actor.vx -= (impulseScalar / actorMass) * pushX;
            actor.vy -= (impulseScalar / actorMass) * pushY;
            pickup.vx += (impulseScalar / pickupMass) * pushX;
            pickup.vy += (impulseScalar / pickupMass) * pushY;
        }
    }

    static resolvePushablePair(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = p1.radius + p2.radius;

        if (dist >= minDist) return;

        let pushX;
        let pushY;
        let pushDist = dist;
        if (pushDist === 0) {
            const angle = Math.random() * Math.PI * 2;
            pushX = Math.cos(angle);
            pushY = Math.sin(angle);
            pushDist = 0.1;
        } else {
            pushX = dx / pushDist;
            pushY = dy / pushDist;
        }

        const overlap = minDist - pushDist;

        p1.x -= pushX * overlap * 0.5;
        p1.y -= pushY * overlap * 0.5;
        p2.x += pushX * overlap * 0.5;
        p2.y += pushY * overlap * 0.5;

        const rvx = (p2.vx || 0) - (p1.vx || 0);
        const rvy = (p2.vy || 0) - (p1.vy || 0);
        const velAlongNormal = rvx * pushX + rvy * pushY;

        if (velAlongNormal < 0) {
            const p1Mass = p1.mass !== undefined ? p1.mass : 15.0;
            const p2Mass = p2.mass !== undefined ? p2.mass : 15.0;
            const restitution = 0.4;
            const impulseScalar = -(1 + restitution) * velAlongNormal / ((1 / p1Mass) + (1 / p2Mass));

            p1.vx -= (impulseScalar / p1Mass) * pushX;
            p1.vy -= (impulseScalar / p1Mass) * pushY;
            p2.vx += (impulseScalar / p2Mass) * pushX;
            p2.vy += (impulseScalar / p2Mass) * pushY;
        }
    }

    static run(state, spatialFrame) {
        const events = [];

        if (!spatialFrame) {
            return events;
        }

        // 1. Projectiles vs Walls, Pickups, and Enemies
        for (const p of state.projectiles) {
            if (p.isDead) continue;

            const wallCandidates = spatialFrame.getWallCandidates(p, state);
            const segment = this.getMissileWallCollision(p, wallCandidates);
            if (segment) {
                p.isDead = true;
                events.push({ target: segment, damage: p.damage });
                continue;
            }

            let hitPickup = false;
            spatialFrame.forEachNeighbor(p, (pickup) => {
                if (hitPickup || pickup instanceof Actor || pickup.isDead || !pickup.strategy?.onHit) return;
                if (this.checkCircle(p, pickup)) {
                    const handled = pickup.strategy.onHit(state, pickup, p, events);
                    if (handled) {
                        hitPickup = true;
                    }
                }
            });
            if (hitPickup) continue;
            p.resolveFactionCollisions(state, events, this, spatialFrame);
        }

        // 2. Actors vs Pushables
        spatialFrame.forEachActorPushablePair((actor, pickup) => {
            this.resolveActorPushable(actor, pickup);
        });

        // 3. Pushables vs Pushables
        spatialFrame.forEachPushablePair((p1, p2) => {
            this.resolvePushablePair(p1, p2);
        });

        // 4. Actor vs Actor
        spatialFrame.forEachCombatantPair((a, b) => {
            if (!this.checkCircle(a, b)) return;

            const chargeInvolved = a.attackType === "charge" || b.attackType === "charge";
            PhysicsSystem.resolveCircleCollision(a, b, {
                restitution: chargeInvolved ? 0.65 : 0.15,
            });

            if (a.attackType === "charge" && a.currentStateName !== "stunned") {
                this.applyChargeImpact(a, b, events);
            }
            if (b.attackType === "charge" && b.currentStateName !== "stunned") {
                this.applyChargeImpact(b, a, events);
            }
        });

        return events;
    }

    static applyChargeImpact(charger, other, events) {
        if (areHostile(charger, other)) {
            events.push({ target: other, damage: enemyDefaults.chargeImpactDamage });
        }
        charger.changeState("stunned", {
            timer: 1000,
            returnState: "charging_prepare",
        });
    }
}
