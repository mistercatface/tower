import { Navigator } from "./Navigator.js";
import { Projectile } from "./Entities.js";

export class Enemy {
    
    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            const wantsToShoot = e.update(dt, state.planet, state.gridSystem, state.walls, state.projectiles, spatialHash);
            if (wantsToShoot) state.projectiles.push(new Projectile(e.x, e.y, e.radius * 0.333, 150, state.planet, null, 10, "enemy"));
            if (e.isDead) state.enemies.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, health, color, reward, type = "standard", attackType = "ranged") {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.health = health;
        this.maxHealth = health;
        this.color = color;
        this.reward = reward;
        this.type = type;
        this.attackType = attackType;
        this.isDead = false;
        this.angle = Math.atan2(-y, -x);
        this.turnSpeed = 10;
        this.isEngaged = false;
        this.desiredX = 0;
        this.desiredY = 0;
        this.sepX = 0;
        this.sepY = 0;
        this.pushX = 0;
        this.pushY = 0;
        this.attackRange = 75;
        this.fireRate = 1000;
        this.fireTimer = 0;
        this.dodgeCooldownTimer = 0;
        this.isDodging = false;
    }

    applyMovement(dt, ignoreSeparation = false) {
        let finalX = this.desiredX + (ignoreSeparation ? 0 : this.sepX);
        let finalY = this.desiredY + (ignoreSeparation ? 0 : this.sepY);

        const len = Math.hypot(finalX, finalY);
        if (len > 0) {
            finalX /= len;
            finalY /= len;
        }

        const targetAngle = Math.atan2(finalY, finalX);
        let angleDiff = targetAngle - this.angle;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        this.angle += angleDiff * Math.min(1, this.turnSpeed * (dt / 1000));

        if (!this.isEngaged || this.attackType === "charge") {
            const moveDist = this.speed * (dt / 1000);
            this.x += finalX * moveDist;
            this.y += finalY * moveDist;
            this.x += this.pushX;
            this.y += this.pushY;
        }
    }

    updateCombat(dt) {
        if (this.attackType === "charge") return false;

        if (this.isEngaged) {
            this.fireTimer += dt;
            if (this.fireTimer >= this.fireRate) {
                this.fireTimer = 0;
                return true;
            }
        }
        return false;
    }

    calculateSeparation(spatialHash) {
        this.sepX = 0;
        this.sepY = 0;
        this.pushX = 0;
        this.pushY = 0;

        if (!spatialHash) return;

        const neighbors = spatialHash.getNearby(this);
        for (const other of neighbors) {
            if (other === this || other.isDead) continue;

            let dx = this.x - other.x;
            let dy = this.y - other.y;
            let dist = Math.hypot(dx, dy);

            if (dist === 0) {
                dx = Math.random() - 0.5;
                dy = Math.random() - 0.5;
                dist = Math.hypot(dx, dy);
            }

            const avoidRadius = this.radius + other.radius + 15;
            if (dist < avoidRadius) {
                const weight = 1 - dist / avoidRadius;
                this.sepX += (dx / dist) * weight;
                this.sepY += (dy / dist) * weight;
            }

            const minSep = this.radius + other.radius + 0.1;
            if (dist < minSep) {
                const overlap = minSep - dist;
                this.pushX += (dx / dist) * overlap * 0.5;
                this.pushY += (dy / dist) * overlap * 0.5;
            }
        }

        let sepLen = Math.hypot(this.sepX, this.sepY);
        if (sepLen > 1.0) {
            this.sepX = (this.sepX / sepLen) * 1.0;
            this.sepY = (this.sepY / sepLen) * 1.0;
        }
    }

    calculateSteering(target, gridSystem) {
        if (this.isEngaged) {
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            this.desiredX = dx;
            this.desiredY = dy;
            return;
        }

        if (gridSystem) {
            const angle = Navigator.getSteeringAngle(this.x, this.y, gridSystem, gridSystem.flowField);
            if (angle !== null) {
                this.desiredX = Math.cos(angle);
                this.desiredY = Math.sin(angle);
                return;
            }
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
            this.desiredX = dx / dist;
            this.desiredY = dy / dist;
        } else {
            this.desiredX = 0;
            this.desiredY = 0;
        }
    }

    resolveWallCollisions(segments) {
        if (!segments) return;

        for (let i = 0; i < 2; i++) {
            for (const seg of segments) {
                if (seg.isDead) continue;

                const dx = this.x - seg.x;
                const dy = this.y - seg.y;
                const distanceSq = dx * dx + dy * dy;
                const minDistance = this.radius + seg.size * 0.5;

                if (distanceSq < minDistance * minDistance) {
                    if (distanceSq === 0) {
                        this.x += minDistance;
                    } else {
                        const distance = Math.sqrt(distanceSq);
                        const overlap = minDistance - distance;
                        this.x += (dx / distance) * overlap;
                        this.y += (dy / distance) * overlap;
                    }
                }
            }
        }
    }

    handleDodging(dt, missiles, gridSystem) {
        if (this.dodgeCooldownTimer > 0) {
            this.dodgeCooldownTimer -= dt;
        }

        if (this.type === "dodger" && this.dodgeCooldownTimer <= 0 && !this.isDodging) {
            this.tryTriggerDodge(missiles, gridSystem);
        }

        if (this.isDodging) {
            this.executeDodgeMovement(dt);
            return true;
        }

        return false;
    }

    tryTriggerDodge(projectiles, gridSystem) {
        for (const m of projectiles) {
            if (m.faction === "enemy") continue;

            const dist = Math.hypot(m.x - this.x, m.y - this.y);
            if (dist < 100 && !m.isDead) {
                const angleToEnemy = Math.atan2(this.y - m.y, this.x - m.x);
                let angleDiff = angleToEnemy - m.angle;
                angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

                if (Math.abs(angleDiff) < 0.5) {
                    if (Math.random() < 0.5) {
                        const perpAngle1 = m.angle + Math.PI / 2;
                        const perpAngle2 = m.angle - Math.PI / 2;
                        const dodgeDist = 25;
                        const angles = Math.random() < 0.5 ? [perpAngle1, perpAngle2] : [perpAngle2, perpAngle1];

                        for (const dodgeAngle of angles) {
                            const destX = this.x + Math.cos(dodgeAngle) * dodgeDist;
                            const destY = this.y + Math.sin(dodgeAngle) * dodgeDist;

                            if (this.isValidDodgeTarget(destX, destY, gridSystem)) {
                                this.isDodging = true;
                                this.dodgeTargetX = destX;
                                this.dodgeTargetY = destY;
                                this.dodgeCooldownTimer = 2000;
                                return;
                            }
                        }
                    } else {
                        this.dodgeCooldownTimer = 500;
                    }
                }
            }
        }
    }

    isValidDodgeTarget(x, y, gridSystem) {
        if (!gridSystem) return true;
        const { col, row } = gridSystem.worldToGrid(x, y);
        if (col >= 0 && col < gridSystem.cols && row >= 0 && row < gridSystem.rows) {
            return gridSystem.grid[row * gridSystem.cols + col] === 0;
        }
        return false;
    }

    executeDodgeMovement(dt) {
        const dx = this.dodgeTargetX - this.x;
        const dy = this.dodgeTargetY - this.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = this.speed * 1.5 * (dt / 1000);

        const targetAngle = Math.atan2(dy, dx);
        let dodgeAngleDiff = targetAngle - this.angle;
        dodgeAngleDiff = Math.atan2(Math.sin(dodgeAngleDiff), Math.cos(dodgeAngleDiff));
        this.angle += dodgeAngleDiff * Math.min(1, this.turnSpeed * 1.5 * (dt / 1000));

        if (dist <= moveDist) {
            this.x = this.dodgeTargetX;
            this.y = this.dodgeTargetY;
            this.isDodging = false;
        } else {
            this.x += (dx / dist) * moveDist;
            this.y += (dy / dist) * moveDist;
        }
    }

    update(dt, target, gridSystem, walls, missiles = [], spatialHash = null) {
        if (this.handleDodging(dt, missiles, gridSystem)) return false;

        this.updateEngagementStatus(target);
        this.calculateSteering(target, gridSystem);
        this.calculateSeparation(spatialHash);
        this.applyMovement(dt, target);
        this.resolveWallCollisions(walls);

        return this.updateCombat(dt);
    }

    updateEngagementStatus(target) {
        const distToTarget = Math.hypot(this.x - target.x, this.y - target.y);
        if (distToTarget <= target.radius + this.attackRange) {
            this.isEngaged = true;
        } else {
            this.isEngaged = false;
        }
    }
}
