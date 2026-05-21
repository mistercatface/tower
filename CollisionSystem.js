export class CollisionSystem {
    static checkCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        return dist < (a.radius + b.radius);
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
        return (distDX * distDX + distDY * distDY) < (circle.radius * circle.radius);
    }

    static checkMissileWallCollision(missile, walls, onWallHitCallback) {
        for (const w of walls) {
            for (const seg of w.segments) {
                if (seg.isDead) continue;
                if (this.checkCircleRect(missile, seg)) {
                    missile.isDead = true;
                    onWallHitCallback(w, seg);
                    return true;
                }
            }
        }
        return false;
    }

    static run(state, onEnemyHit, onPlanetHit, onWallHit) {
        for (const m of state.missiles) {
            if (m.isDead) continue;
            
            if (this.checkMissileWallCollision(m, state.walls, (w, seg) => onWallHit(w, seg, state.weapon.damage))) {
                continue;
            }

            if (state.abilities["Eraser"]) {
                for (const em of state.enemyMissiles) {
                    if (em.isDead) continue;
                    if (this.checkCircle(m, em)) {
                        em.isDead = true;
                        if (m.penetration > 0) {
                            m.penetration--;
                        } else {
                            m.isDead = true;
                            break;
                        }
                    }
                }
                if (m.isDead) continue;
            }

            for (const e of state.enemies) {
                if (e.isDead) continue;
                if (this.checkCircle(m, e)) {
                    onEnemyHit(e, state.weapon.damage);
                    if (e.isDead && m.penetration > 0) {
                        m.penetration--;
                    } else {
                        m.isDead = true;
                        break;
                    }
                }
            }
        }

        for (const em of state.enemyMissiles) {
            if (em.isDead) continue;
            
            if (this.checkMissileWallCollision(em, state.walls, (w, seg) => onWallHit(w, seg, em.damage))) {
                continue;
            }

            if (this.checkCircle(em, state.planet)) {
                em.isDead = true;
                onPlanetHit(em.damage);
            }
        }
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