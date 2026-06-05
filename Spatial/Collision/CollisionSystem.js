import { circleIntersectsSegment } from "../../Libraries/Spatial/geometry/WallGeometry.js";
import { SatCollision } from "./SatCollision.js";
import { shouldResolveActorPushable } from "./PairBroadphase.js";
import { wakePushable } from "./PushableSleep.js";
import { areHostile } from "../../Combat/Targeting.js";
import { PhysicsSystem } from "../Motion/PhysicsSystem.js";
import { enemyDefaults } from "../../Config/Config.js";
import { Actor } from "../../Entities/Actor.js";
import { CombatParticles } from "../../Render/CombatParticles.js";

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
        if (!shouldResolveActorPushable(actor, pickup)) return;

        const collisionInfo = SatCollision.checkCollision(
            actor, actor.getShape(),
            pickup, pickup.getShape()
        );

        if (!collisionInfo) return;

        const pushX = collisionInfo.nx;
        const pushY = collisionInfo.ny;
        const overlap = collisionInfo.overlap;

        const actorMass = actor.mass !== undefined ? actor.mass : actor.radius;
        const pickupMass = pickup.mass !== undefined ? pickup.mass : 1.0;
        const totalMass = actorMass + pickupMass;

        const actorShift = overlap * (pickupMass / totalMass);
        const pickupShift = overlap * (actorMass / totalMass);

        actor.x -= pushX * actorShift;
        actor.y -= pushY * actorShift;
        pickup.x += pushX * pickupShift;
        pickup.y += pushY * pickupShift;

        actor._wallResolvedFrame = null;
        pickup._wallResolvedFrame = null;

        wakePushable(pickup);
        PhysicsSystem.applyRigidBodyImpulse(actor, pickup, collisionInfo, 0.15);
    }

    static resolvePushablePair(p1, p2) {
        const collisionInfo = SatCollision.checkCollision(
            p1, p1.getShape(),
            p2, p2.getShape()
        );

        if (!collisionInfo) return;

        const pushX = collisionInfo.nx;
        const pushY = collisionInfo.ny;
        const overlap = collisionInfo.overlap;

        const p1Mass = p1.mass !== undefined ? p1.mass : 15.0;
        const p2Mass = p2.mass !== undefined ? p2.mass : 15.0;
        const totalMass = p1Mass + p2Mass;

        const p1Shift = overlap * (p2Mass / totalMass);
        const p2Shift = overlap * (p1Mass / totalMass);

        p1.x -= pushX * p1Shift;
        p1.y -= pushY * p1Shift;
        p2.x += pushX * p2Shift;
        p2.y += pushY * p2Shift;

        p1._wallResolvedFrame = null;
        p2._wallResolvedFrame = null;

        wakePushable(p1);
        wakePushable(p2);
        PhysicsSystem.applyRigidBodyImpulse(p1, p2, collisionInfo, 0.4);
    }

    static run(state, spatialFrame) {
        const events = [];

        // 1. Projectiles vs Walls, Pickups, and Enemies
        for (const p of state.projectiles) {
            if (p.isDead) continue;

            const wallCandidates = spatialFrame.getWallCandidates(p, state);
            const segment = this.getMissileWallCollision(p, wallCandidates);
            if (segment) {
                p.strategy.onWallCollision(p, state, segment, events);
                continue;
            }

            let hitPickup = false;
            spatialFrame.forEachNeighbor(p, (pickup) => {
                if (hitPickup || pickup instanceof Actor || pickup.isDead || !pickup.strategy?.onHit) return;
                if (this.checkCircle(p, pickup)) {
                    const handled = p.strategy.onPickupCollision(p, state, pickup, events);
                    if (handled) {
                        hitPickup = true;
                    }
                }
            });
            if (hitPickup) continue;
            p.resolveFactionCollisions(state, events, this, spatialFrame);
        }

        // 2. Resolve pushables (Actor vs Pushable and Pushable vs Pushable) iteratively with wall constraints
        const iterations = 4;
        for (let iter = 0; iter < iterations; iter++) {
            spatialFrame.forEachActorPushablePair((actor, pickup) => {
                this.resolveActorPushable(actor, pickup);
            });

            spatialFrame.forEachPushablePair((p1, p2) => {
                this.resolvePushablePair(p1, p2);
            });

            for (let i = 0; i < spatialFrame._pushables.length; i++) {
                const pickup = spatialFrame._pushables[i];
                if (pickup.isDead || !pickup.needsWallCollision()) continue;
                PhysicsSystem.resolveWallCollisions(pickup, spatialFrame, state);
            }
        }

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
