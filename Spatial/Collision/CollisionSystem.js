import { SpatialHash } from "../World/SpatialHash.js";
import { circleIntersectsSegment } from "../Navigation/WallGeometry.js";

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

    static getMissileWallCollision(missile, segments) {
        if (!segments) return null;

        let candidateWalls = segments;
        if (segments.obstacleGrid) candidateWalls = segments.obstacleGrid.getNearbySegments(missile);

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

    static run(state) {
        const events = [];

        // Build a spatial hash for active pickups (including barrels)
        const pickupHash = new SpatialHash(50);
        const pushables = [];
        for (let i = 0; i < state.pickups.length; i++) {
            const p = state.pickups[i];
            if (!p.isDead) {
                pickupHash.insert(p);
                if (p.strategy?.isPushable) {
                    pushables.push(p);
                }
            }
        }

        // 1. Projectiles vs Walls, Pickups, and Enemies
        for (const p of state.projectiles) {
            if (p.isDead) continue;
            
            const segment = this.getMissileWallCollision(p, state.walls);
            if (segment) {
                p.isDead = true;
                const damage = p.faction === "player" ? state.player.weapon.damage : p.damage;
                events.push({ target: segment, damage: damage });
                continue;
            }

            let hitPickup = false;
            const nearbyPickups = pickupHash.getNearby(p);
            for (let i = 0; i < nearbyPickups.length; i++) {
                const pickup = nearbyPickups[i];
                if (!pickup.isDead && pickup.strategy && pickup.strategy.onHit) {
                    if (this.checkCircle(p, pickup)) {
                        const handled = pickup.strategy.onHit(state, pickup, p, events);
                        if (handled) {
                            hitPickup = true;
                            break;
                        }
                    }
                }
            }
            if (hitPickup) continue;
            p.resolveFactionCollisions(state, events, this);
        }

        // 2. Actors vs Pushables
        const actors = [state.player, ...state.enemies];
        for (const actor of actors) {
            if (!actor || actor.isDead) continue;
            
            const nearbyPickups = pickupHash.getNearby(actor);
            for (let i = 0; i < nearbyPickups.length; i++) {
                const pickup = nearbyPickups[i];
                if (pickup.isDead || !pickup.strategy?.isPushable) continue;

                const dx = pickup.x - actor.x;
                const dy = pickup.y - actor.y;
                const dist = Math.hypot(dx, dy);
                const minDist = actor.radius + pickup.radius;

                if (dist < minDist) {
                    let pushX, pushY;
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
            }
        }

        // 3. Pushables vs Pushables
        const checkedPairs = new Set();
        for (let i = 0; i < pushables.length; i++) {
            const p1 = pushables[i];
            if (p1.isDead) continue;

            const nearbyPushables = pickupHash.getNearby(p1);
            for (let j = 0; j < nearbyPushables.length; j++) {
                const p2 = nearbyPushables[j];
                if (p2 === p1 || p2.isDead || !p2.strategy?.isPushable) continue;

                // Deduplicate checked collision pairs
                const pairKey = p1.id < p2.id ? `${p1.id}:${p2.id}` : `${p2.id}:${p1.id}`;
                if (checkedPairs.has(pairKey)) continue;
                checkedPairs.add(pairKey);

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy);
                const minDist = p1.radius + p2.radius;

                if (dist < minDist) {
                    let pushX, pushY;
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
            }
        }

        // 4. Charging Enemies vs Player
        for (const e of state.enemies) {
            if (e.isDead) continue;
            if (e.attackType === "charge" && this.checkCircle(e, state.player)) {
                e.isDead = true;
                events.push({ target: state.player, damage: 5 });
            }
        }
        return events;
    }
}