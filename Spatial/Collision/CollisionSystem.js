import { circlesOverlap, findFirstCircleSegmentHit } from "../../Libraries/Spatial/collision/overlap.js";
import { resolveSatPair } from "../../Libraries/Spatial/collision/satPair.js";
import { shouldResolveActorPushable } from "../../Libraries/Spatial/collision/entityBroadphase.js";
import { wakePushable } from "./PushableSleep.js";
import { areHostile } from "../../Combat/Targeting.js";
import { PhysicsSystem } from "../Motion/PhysicsSystem.js";
import { enemyDefaults } from "../../Config/Config.js";
import { PairFilter } from "../../Libraries/Interaction/PairFilter.js";
import { PROJECTILE_HIT_PICKUP } from "../../Libraries/Interaction/presets/combat.js";
import { CombatParticles } from "../../Render/CombatParticles.js";

const projectilePickupFilter = new PairFilter(PROJECTILE_HIT_PICKUP);

export class CollisionSystem {
    static checkCircle(a, b) {
        return circlesOverlap(a, b);
    }

    static checkCircleRect(circle, rect) {
        return findFirstCircleSegmentHit(circle, [rect]) !== null;
    }

    static getMissileWallCollision(missile, candidateWalls) {
        return findFirstCircleSegmentHit(missile, candidateWalls);
    }

    static resolveActorPushable(actor, pickup) {
        if (!shouldResolveActorPushable(actor, pickup)) return;

        const collisionInfo = resolveSatPair(
            actor, actor.getShape(),
            pickup, pickup.getShape(),
            {
                massA: actor.mass !== undefined ? actor.mass : actor.radius,
                massB: pickup.mass !== undefined ? pickup.mass : 1.0,
                restitution: 0.15,
            },
        );
        if (!collisionInfo) return;

        actor._wallResolvedFrame = null;
        pickup._wallResolvedFrame = null;
        wakePushable(pickup);
    }

    static resolvePushablePair(p1, p2) {
        const collisionInfo = resolveSatPair(
            p1, p1.getShape(),
            p2, p2.getShape(),
            {
                massA: p1.mass !== undefined ? p1.mass : 15.0,
                massB: p2.mass !== undefined ? p2.mass : 15.0,
                restitution: 0.4,
            },
        );
        if (!collisionInfo) return;

        p1._wallResolvedFrame = null;
        p2._wallResolvedFrame = null;
        wakePushable(p1);
        wakePushable(p2);
    }

    static run(state, spatialFrame) {
        const events = [];

        for (const p of state.projectiles) {
            if (p.isDead) continue;

            const wallCandidates = spatialFrame.getWallCandidates(p);
            const segment = this.getMissileWallCollision(p, wallCandidates);
            if (segment) {
                p.strategy.onWallCollision(p, state, segment, events);
                continue;
            }

            let hitPickup = false;
            spatialFrame.forEachNeighbor(p, (pickup) => {
                if (hitPickup || !projectilePickupFilter.allows(p, pickup)) return;
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
