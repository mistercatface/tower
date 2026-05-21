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

    static getMissileWallCollision(missile, walls) {
        for (const w of walls) {
            for (const seg of w.segments) {
                if (seg.isDead) continue;
                if (this.checkCircleRect(missile, seg)) {
                    return { wall: w, segment: seg };
                }
            }
        }
        return null;
    }

    static run(state) {
        const events = [];
        for (const p of state.projectiles) {
            if (p.isDead) continue;
            const wallHit = this.getMissileWallCollision(p, state.walls);
            if (wallHit) {
                p.isDead = true;
                const damage = p.faction === "player" ? state.weapon.damage : p.damage;
                events.push({ type: "wallHit", wall: wallHit.wall, segment: wallHit.segment, damage: damage });
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

export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    clear() {
        this.cells.clear();
    }

    insert(entity) {
        const col = Math.floor(entity.x / this.cellSize);
        const row = Math.floor(entity.y / this.cellSize);
        const key = `${col},${row}`;
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(entity);
    }

    getNearby(entity) {
        const col = Math.floor(entity.x / this.cellSize);
        const row = Math.floor(entity.y / this.cellSize);
        const nearby = [];

        for (let r = -1; r <= 1; r++) {
            for (let c = -1; c <= 1; c++) {
                const key = `${col + c},${row + r}`;
                if (this.cells.has(key)) {
                    nearby.push(...this.cells.get(key));
                }
            }
        }
        return nearby;
    }
}