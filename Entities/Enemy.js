import { Navigator } from "../Navigator.js";
import { Projectile } from "./Projectile.js";
import { Turret } from "../Turret.js";
import { enemyStates } from "../EnemyStates.js";
import { DestructibleEntity } from "./Entity.js";
import { Separation } from "../Separation.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { saveProgress } from "../Storage.js";
import { updateUI } from "../UI.js";
import { ChargedWeaponMode } from "../WeaponSystem.js";

export class Enemy extends DestructibleEntity {
    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            e.currentState.update(e, dt, state.planet, state.gridSystem, state.walls, state.projectiles, spatialHash, state.scheduler, state);
            if (e.isDead) state.enemies.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, health, color, reward, type = "standard", attackType = "ranged", canDodge = false) {
        super(x, y, 0, health, health, false);
        this.radius = radius;
        this.speed = speed;
        this.color = color;
        this.reward = reward;
        this.type = type;
        this.attackType = attackType;
        this.canDodge = canDodge;
        this.turnSpeed = 10;
        this.turret = new Turret(0, 10);
        this.isEngaged = false;
        this.desiredX = 0;
        this.desiredY = 0;
        this.separation = new Separation();
        this.attackRange = 75;
        this.fireRate = 1500;
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.currentState = enemyStates.navigating;
        this.weaponMode = new ChargedWeaponMode((state, tx, ty, angle, source) => {
            state.projectiles.push(new Projectile(tx, ty, source.radius * 0.333, 150, state.planet, angle, 10, "enemy"));
        });
    }

    handleHit(baseDamage, ctx) {
        const died = this.takeDamage(baseDamage);
        if (died) ProgressionManager.processEnemyKillRewards(this, ctx.state, ctx.upgrades);
        saveProgress(ctx.state);
        updateUI(ctx.state, ctx.upgrades);
    }

    changeState(stateName) {
        this.currentState = enemyStates[stateName];
    }

    applyMovement(dt, ignoreSeparation = false, shouldMove = true) {
        let finalX = this.desiredX + (ignoreSeparation ? 0 : this.separation.x);
        let finalY = this.desiredY + (ignoreSeparation ? 0 : this.separation.y);

        const len = Math.hypot(finalX, finalY);
        if (len > 0) {
            finalX /= len;
            finalY /= len;
        }

        const targetAngle = Math.atan2(finalY, finalX);
        let angleDiff = targetAngle - this.angle;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        this.angle += angleDiff * Math.min(1, this.turnSpeed * (dt / 1000));

        if (shouldMove) {
            const moveDist = this.speed * (dt / 1000);
            this.x += finalX * moveDist;
            this.y += finalY * moveDist;
            this.x += this.separation.pushX;
            this.y += this.separation.pushY;
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

    shouldTriggerDodge(projectiles, gridSystem, scheduler) {
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
                                this.dodgeTargetX = destX;
                                this.dodgeTargetY = destY;
                                this.dodgeTimerId = scheduler.schedule(2000);
                                return true;
                            }
                        }
                    } else {
                        this.dodgeTimerId = scheduler.schedule(500);
                    }
                }
            }
        }
        return false;
    }
    
    isValidDodgeTarget(x, y, gridSystem) {
        if (!gridSystem) return true;
        const { col, row } = gridSystem.worldToGrid(x, y);
        if (col >= 0 && col < gridSystem.cols && row >= 0 && row < gridSystem.rows) {
            return gridSystem.grid[row * gridSystem.cols + col] === 0;
        }
        return false;
    }
}