import { Navigator } from "../Spatial/Navigator.js";
import { Utilities } from "../Utilities.js";
import { Projectile } from "./Projectile.js";
import { Turret } from "../Turret.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { enemyStates } from "../EnemyStates.js";
import { DestructibleEntity } from "./Entity.js";
import { FloatingText } from "../FloatingText.js";
import { Separation } from "../Spatial/Separation.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { markProgressDirty } from "../Storage.js";
import { updateUI } from "../UI.js";
import { ChargedWeaponMode } from "../WeaponSystem.js";
import { PhysicsSystem } from "../Spatial/PhysicsSystem.js";
import { enemyProjectileSettings } from "../Config.js";
import { createEntityBars } from "./EntityBars.js";

const enemyBars = createEntityBars({
    healthWidth: 22,
    healthHeight: 3,
    healthBorderRadius: 1.5,
});

export class Enemy extends DestructibleEntity {
    static healthBar = enemyBars.healthBar;
    static chargeBar = enemyBars.chargeBar;

    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            e.currentState.update(e, dt, state.player, state.gridSystem, state.walls, state.projectiles, spatialHash, state.scheduler, state);
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
        this.blastAngle = 0;
        this.blastTimer = 0;
        this.separation = new Separation();
        const calculatedRange = 75 + Math.floor(Math.random() * 70);
        this.weapon = {
            chargeTime: 1500,
            range: calculatedRange,
            accuracy: 0.9,
            weaponMode: new ChargedWeaponMode((state, tx, ty, angle, source) => {
                const m = new Projectile(tx, ty, source.radius * enemyProjectileSettings.radiusMultiplier, enemyProjectileSettings.speed, state.player, angle, enemyProjectileSettings.damage, "enemy");
                state.projectiles.push(m);
                if (source) {
                    PhysicsSystem.applyKnockback(source, angle + Math.PI, m.radius * enemyProjectileSettings.knockbackMultiplier);
                }
            })
        };
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.currentState = enemyStates.navigating;
        this.stateData = {};
        this.chargeCooldown = 0;
        this.startingAbilities = [];
        this.healthBar = Enemy.healthBar;
        this.chargeBar = Enemy.chargeBar;
    }

    handleHit(baseDamage, ctx, hitType) {
        const died = this.takeDamage(baseDamage);
        
        if (hitType === "blast") {
            FloatingText.spawnBlastDamageText(ctx.state, this.x, this.y, baseDamage, 0);
        }
        
        if (died) {
            ProgressionManager.processEnemyKillRewards(this, ctx.state, ctx.upgrades);
            markProgressDirty(ctx.state);
        }
        updateUI(ctx.state, ctx.upgrades);
    }

    changeState(stateName, stateDataInit = null) {
        if (this.currentState && this.currentState.onExit) {
            this.currentState.onExit(this);
        }
        this.currentState = enemyStates[stateName];
        this.stateData = stateDataInit || {};
        if (this.currentState && this.currentState.onEnter) {
            this.currentState.onEnter(this);
        }
    }

    steerTowardPoint(targetX, targetY, gridSystem, flowField = null) {
        const field = flowField ?? gridSystem?.flowField;
        if (gridSystem && field) {
            const angle = Navigator.getSteeringAngle(this.x, this.y, gridSystem, field);
            if (angle !== null) {
                this.desiredX = Math.cos(angle);
                this.desiredY = Math.sin(angle);
                return;
            }
        }

        Utilities.setDesiredDirection(this, targetX - this.x, targetY - this.y);
    }

    calculateSteering(target, gridSystem) {
        this.steerTowardPoint(target.x, target.y, gridSystem);
    }

    applyLocomotion(dt, walls, spatialHash, {
        state = null,
        externalSpeedMod = 1,
        ignoreSeparationInDesired = false,
        shouldMove = true,
        alignAngleWithMovement = true,
    } = {}) {
        this.separation.update(this, spatialHash);
        const baseSpeed = this.speed;
        if (externalSpeedMod !== 1) {
            this.speed = baseSpeed * externalSpeedMod;
        }
        PhysicsSystem.applyMovement(this, dt, ignoreSeparationInDesired, shouldMove, alignAngleWithMovement);
        if (externalSpeedMod !== 1) {
            this.speed = baseSpeed;
        }
        PhysicsSystem.resolveWallCollisions(this, walls, state);
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

    canReposition(state) {
        return false;
    }

    getVelocityMagnitude() {
        return Math.hypot(this.vx, this.vy);
    }

    getMovementSpeedRatio() {
        if (this.speed <= 0) return 0;
        return Math.min(1, this.getVelocityMagnitude() / this.speed);
    }

    applyMovementAccuracyPenalty(baseAccuracy, minMultiplier = 0.5) {
        const ratio = this.getMovementSpeedRatio();
        return baseAccuracy * (1 - (1 - minMultiplier) * ratio);
    }

    renderBars(ctx, cache, yOffset, chargeRatios) {
        if (this.health < this.maxHealth && this.healthBar) {
            const currentHealth = Math.max(0, this.health);
            this.healthBar.render(ctx, this.x, this.y - yOffset, currentHealth / this.maxHealth, cache);
        }

        if (chargeRatios && chargeRatios.length > 0 && this.chargeBar) {
            let activeBarsCount = 0;
            for (let i = 0; i < chargeRatios.length; i++) {
                const ratio = chargeRatios[i];
                if (ratio > 0) {
                    this.chargeBar.render(ctx, this.x, this.y - (yOffset + 5 + activeBarsCount * 5), ratio, cache);
                    activeBarsCount++;
                }
            }
        }
    }

    renderStatusBars(ctx, renderer, state) {
        const chargeRatio = this.turret && this.turret.charge > 0 ? this.turret.charge / (this.weapon.chargeTime || 1) : 0;
        this.renderBars(ctx, renderer.enemyCache, 14, [chargeRatio]);
    }

    render(ctx, renderer, state) {
        if (this.currentState && this.currentState.render) {
            this.currentState.render(this, ctx, renderer.enemyCache, renderer.turretCache);
        }

        const cacheKey = `${this.radius}_${this.color}`;
        this.renderCachedSprite(ctx, renderer.enemyCache, cacheKey, RenderSprites.enemy, this.radius, this.color);

        if (this.turret) {
            this.turret.render(ctx, this.x, this.y, this.radius, renderer, this.color);
        }
    }
}