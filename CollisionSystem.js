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
                events.push({ type: "wallHit", segment, damage });
                continue;
            }
            if (p.faction === "player") {
                if (state.abilities["Eraser"]) {
                    for (const ep of state.projectiles) {
                        if (ep.isDead || ep.faction !== "enemy") continue;
                        if (this.checkCircle(p, ep)) {
                            ep.isDead = true;
                            if (p.penetration > 0) {
                                p.penetration--;
                            } else {
                                p.isDead = true;
                                break;
                            }
                        }
                    }
                    if (p.isDead) continue;
                }
                for (const e of state.enemies) {
                    if (e.isDead) continue;
                    if (this.checkCircle(p, e)) {
                        events.push({ type: "enemyHit", enemy: e, damage: state.weapon.damage });
                        if (e.health <= state.weapon.damage && p.penetration > 0) {
                            p.penetration--;
                            e.health -= state.weapon.damage;
                        } else {
                            p.isDead = true;
                            break;
                        }
                    }
                }
            } else if (p.faction === "enemy") {
                if (this.checkCircle(p, state.planet)) {
                    p.isDead = true;
                    events.push({ type: "planetHit", damage: p.damage });
                }
            }
        }
        return events;
    }
}