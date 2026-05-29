import { CollisionSystem } from "../../Spatial/Collision/CollisionSystem.js";
import { Utilities } from "../../Core/Utilities.js";
import { PhysicsSystem } from "../../Spatial/Motion/PhysicsSystem.js";

function repelEntities(state, exp, dt) {
    for (const e of state.enemies) {
        if (e.isDead) continue;
        const dx = e.x - exp.x;
        const dy = e.y - exp.y;
        const dist = Math.hypot(dx, dy);
        const minDist = exp.radius + e.radius;
        if (dist < minDist) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, state.walls, e.radius)) {
                let pushX = 1, pushY = 0;
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
                e.x += pushX * overlap;
                e.y += pushY * overlap;
                
                const angle = Math.atan2(pushY, pushX);
                e.changeState("blasted", { angle: angle, timer: 500 });
                PhysicsSystem.resolveWallCollisions(e, state.walls, state);
            }
        }
    }

    const p = state.player;
    if (p && !p.isDead) {
        const dx = p.x - exp.x;
        const dy = p.y - exp.y;
        const dist = Math.hypot(dx, dy);
        const minDist = exp.radius + p.radius;
        if (dist < minDist) {
            if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, state.walls, p.radius)) {
                let pushX = 1, pushY = 0;
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
                p.x += pushX * overlap;
                p.y += pushY * overlap;
                
                const angle = Math.atan2(pushY, pushX);
                p.changeState("blasted", { angle: angle, timer: 500 });
                PhysicsSystem.resolveWallCollisions(p, state.walls, state);
            }
        }
    }
}

export const ExplosionStrategies = {
    standard: {
        update(state, exp, dt, allEvents) {
            if (exp.phase === "expanding") {
                exp.radius += exp.speed * (dt / 1000);

                for (const seg of state.walls) {
                    if (seg.isDead || exp.hitTargets.has(seg)) continue;
                    if (CollisionSystem.checkCircleRect(exp, seg)) {
                        let blocked = false;
                        for (const otherSeg of state.walls) {
                            if (otherSeg === seg || otherSeg.isDead) continue;
                            const dist = Utilities.distToSegment(otherSeg.x, otherSeg.y, exp.x, exp.y, seg.x, seg.y);
                            if (dist < otherSeg.size * 0.5) {
                                blocked = true;
                                break;
                            }
                        }
                        if (!blocked) {
                             allEvents.push({ target: seg, damage: 10, type: "blast" });
                            exp.hitTargets.add(seg);
                        }
                    }
                }

                for (const e of state.enemies) {
                    if (e.isDead || exp.hitTargets.has(e)) continue;
                    const dist = Math.hypot(e.x - exp.x, e.y - exp.y);
                    if (dist <= exp.radius + e.radius) {
                        if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, state.walls, e.radius)) {
                            const maxDmg = exp.damage * 1.6;
                            const minDmg = exp.damage * 0.4;
                            const proximityRatio = Math.min(1.0, dist / exp.maxRadius);
                            const dmg = maxDmg - (maxDmg - minDmg) * proximityRatio;

                            allEvents.push({ target: e, damage: dmg, type: "blast" });
                            exp.hitTargets.add(e);
                        }
                    }
                }

                        if (!exp.hitTargets.has(state.player)) {
                            const dist = Math.hypot(state.player.x - exp.x, state.player.y - exp.y);
                            if (dist <= exp.radius + state.player.radius) {
                                if (Utilities.hasLineOfSight(exp.x, exp.y, state.player.x, state.player.y, state.walls, state.player.radius)) {
                                    const maxDmg = exp.damage;
                                    const minDmg = exp.damage * 0.5;
                                    const proximityRatio = Math.min(1.0, dist / exp.maxRadius);
                                    const dmg = maxDmg - (maxDmg - minDmg) * proximityRatio;

                                    allEvents.push({ target: state.player, damage: dmg, type: "blast" });
                                    exp.hitTargets.add(state.player);
                                }
                            }
                        }

                for (const p of state.pickups) {
                    if (p.isDead || exp.hitTargets.has(p)) continue;
                    const dist = Math.hypot(p.x - exp.x, p.y - exp.y);
                    if (dist <= exp.radius + p.radius) {
                        if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, state.walls, p.radius)) {
                            if (p.strategy && p.strategy.onHit) {
                                const maxDmg = exp.damage * 1.6;
                                const minDmg = exp.damage * 0.4;
                                const proximityRatio = Math.min(1.0, dist / exp.maxRadius);
                                const dmg = maxDmg - (maxDmg - minDmg) * proximityRatio;
                                p.strategy.onHit(state, p, { isDead: false, damage: dmg, isExplosion: true }, allEvents);
                                exp.hitTargets.add(p);
                            }
                        }
                    }
                }

                if (exp.radius >= exp.maxRadius) {
                    exp.radius = exp.maxRadius;
                    exp.phase = "lingering";
                }
            } else if (exp.phase === "lingering") {
                exp.lingerTimer -= dt;
                if (exp.lingerTimer <= 0) {
                    exp.phase = "fading";
                }
            } else if (exp.phase === "fading") {
                exp.fadeTimer -= dt;
                exp.opacity = Math.max(0, exp.fadeTimer / 500);
                if (exp.fadeTimer <= 0) {
                    exp.isDead = true;
                }
            }
        },
        repel(state, exp, dt) {
            if (exp.phase === "expanding" || exp.phase === "lingering") {
                repelEntities(state, exp, dt);
            }
        }
    }
};
