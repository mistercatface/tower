export class CollisionSystem {
    static checkCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        return dist < a.radius + b.radius;
    }

    static checkCircleRect(circle, rect) {
        const dx = circle.x - rect.x;
        const dy = circle.y - rect.y;

        const cos = Math.cos(-rect.angle);
        const sin = Math.sin(-rect.angle);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        const half = rect.size / 2;
        const closestX = Math.max(-half, Math.min(localX, half));
        const closestY = Math.max(-half, Math.min(localY, half));

        const distDX = localX - closestX;
        const distDY = localY - closestY;
        return distDX * distDX + distDY * distDY < circle.radius * circle.radius;
    }

    static getMissileWallCollision(missile, segments) {
        for (const seg of segments) {
            if (seg.isDead) continue;
            if (this.checkCircleRect(missile, seg)) return seg;
        }
        return null;
    }

    static run(state) {
        const events = [];
        for (const p of state.projectiles) {
            if (p.isDead) continue;
            const segment = this.getMissileWallCollision(p, state.walls);
            if (segment) {
                p.isDead = true;
                const damage = p.faction === "player" ? state.weapon.damage : p.damage;
                events.push({ target: segment, damage: damage });
                continue;
            }

            let hitPickup = false;
            for (const pickup of state.pickups) {
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

        const actors = [state.planet, ...state.enemies];
        for (const actor of actors) {
            if (!actor || actor.isDead) continue;
            for (const pickup of state.pickups) {
                if (pickup.isDead || pickup.type !== "barrel") continue;

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

                    const avx = actor.vx || 0;
                    const avy = actor.vy || 0;
                    const actorSpeed = Math.hypot(avx, avy);
                    if (actorSpeed > 0) {
                        const anx = avx / actorSpeed;
                        const any = avy / actorSpeed;
                        const dot = pushX * anx + pushY * any;
                        if (dot > 0.5) {
                            const perpX = -any;
                            const perpY = anx;
                            const side = (pushX * perpX + pushY * perpY) >= 0 ? 1 : -1;
                            pushX += perpX * side * 0.6;
                            pushY += perpY * side * 0.6;
                            const pushLen = Math.hypot(pushX, pushY);
                            pushX /= pushLen;
                            pushY /= pushLen;
                        }
                    }

                    const overlap = minDist - pushDist;
                    pickup.x += pushX * overlap;
                    pickup.y += pushY * overlap;

                    actor.vx = (actor.vx || 0) * 0.7;
                    actor.vy = (actor.vy || 0) * 0.7;

                    const pushSpeed = Math.max(actorSpeed * 0.8, 80);
                    pickup.vx = pushX * pushSpeed;
                    pickup.vy = pushY * pushSpeed;
                }
            }
        }

        for (const e of state.enemies) {
            if (e.isDead) continue;
            if (e.attackType === "charge" && this.checkCircle(e, state.planet)) {
                e.isDead = true;
                events.push({ target: state.planet, damage: 5 });
            }
        }
        return events;
    }
}