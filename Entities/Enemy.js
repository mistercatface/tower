import { Navigator } from "../Spatial/Navigator.js";
import { Utilities } from "../Utilities.js";
import { Projectile } from "./Projectile.js";
import { Turret } from "../Turret.js";
import { enemyStates } from "../EnemyStates.js";
import { DestructibleEntity } from "./Entity.js";
import { Separation } from "../Spatial/Separation.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { saveProgress } from "../Storage.js";
import { updateUI } from "../UI.js";
import { ChargedWeaponMode } from "../WeaponSystem.js";
import { PhysicsSystem } from "../Spatial/PhysicsSystem.js";

export class Enemy extends DestructibleEntity {
    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            e.currentState.update(e, dt, state.planet, state.gridSystem, state.walls, state.projectiles, spatialHash, state.scheduler, state);
            if (e.isDead) state.enemies.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, health, color, reward, type = "standard", attackType = "ranged", canDodge = false, accelRate = 3.0, canDamageWalls = false) {
        super(x, y, 0, health, health, false);
        this.radius = radius;
        this.mass = type === "boss" ? 200.0 : radius;
        this.speed = speed;
        this.color = color;
        this.reward = reward;
        this.type = type;
        this.attackType = attackType;
        this.canDodge = canDodge;
        this.accelRate = accelRate;
        this.canDamageWalls = canDamageWalls;
        this.turnSpeed = 10;
        this.turret = new Turret(0, 10);
        this.isEngaged = false;
        this.desiredX = 0;
        this.desiredY = 0;
        this.vx = 0;
        this.vy = 0;
        this.separation = new Separation();
        this.attackRange = 75 + Math.floor(Math.random() * 70);
        this.fireRate = 1500;
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.currentState = enemyStates.navigating;
        this.weaponMode = new ChargedWeaponMode((state, tx, ty, angle, source) => {
            const m = new Projectile(tx, ty, source.radius * 0.333, 150, state.planet, angle, 10, "enemy");
            state.projectiles.push(m);
            if (source) {
                PhysicsSystem.applyKnockback(source, angle + Math.PI, m.radius * 120);
            }
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

    calculateSteering(target, gridSystem) {
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

    shouldTriggerDodge(projectiles, gridSystem, scheduler) {
        for (const m of projectiles) {
            if (m.faction === "enemy") continue;

            const dist = Math.hypot(m.x - this.x, m.y - this.y);
            if (dist < 100 && !m.isDead) {
                const angleToEnemy = Math.atan2(this.y - m.y, this.x - m.x);
                let angleDiff = angleToEnemy - m.angle;
                angleDiff = Utilities.normalizeAngle(angleDiff);

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