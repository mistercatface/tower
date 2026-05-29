import { Utilities } from "../Core/Utilities.js";
import { Projectile } from "./Projectile.js";
import { Turret } from "./Turret.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { Actor } from "./Actor.js";
import { spawnFloatingText, emitCombatEnemyKilled } from "../Core/EventSystem.js";
import { ChargedWeaponMode } from "../Combat/WeaponSystem.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { enemyProjectileSettings, NAV_PROFILES } from "../Config/Config.js";
import { createEntityBars } from "./EntityBars.js";
import { Pools } from "../Core/Pools.js";

const enemyBars = createEntityBars({
    healthWidth: 22,
    healthHeight: 3,
    healthBorderRadius: 1.5,
});

export class Enemy extends Actor {
    static healthBar = enemyBars.healthBar;
    static chargeBar = enemyBars.chargeBar;

    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            e.currentState.update(e, dt, state.player, state.flowFieldGrid, state.walls, state.projectiles, spatialHash, state.scheduler, state);
            if (e.isDead) state.enemies.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, health, color, reward, type = "standard", attackType = "ranged", canDodge = false, accelRate = 3.0, canDamageWalls = false) {
        super(x, y, radius, speed, health, color, type, accelRate, canDamageWalls);
        this.reward = reward;
        this.attackType = attackType;
        this.canDodge = canDodge;
        this.turret = new Turret(0, 10);
        this.isEngaged = false;
        this.blastAngle = 0;
        this.blastTimer = 0;
        const calculatedRange = 75 + Math.floor(Math.random() * 70);
        this.weapon = {
            chargeTime: 1500,
            range: calculatedRange,
            accuracy: 0.9,
            weaponMode: new ChargedWeaponMode((state, tx, ty, angle, source) => {
                const m = Pools.projectiles.acquire(tx, ty, source.radius * enemyProjectileSettings.radiusMultiplier, enemyProjectileSettings.speed, state.player, angle, enemyProjectileSettings.damage, "enemy");
                state.projectiles.push(m);
                if (source) {
                    PhysicsSystem.applyKnockback(source, angle + Math.PI, m.radius * enemyProjectileSettings.knockbackMultiplier);
                }
            })
        };
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.chargeCooldown = 0;
        this.startingAbilities = [];
        this.healthBar = Enemy.healthBar;
        this.chargeBar = Enemy.chargeBar;
    }

    handleHit(baseDamage, ctx, hitType) {
        const died = this.takeDamage(baseDamage);
        
        if (hitType === "blast") {
            spawnFloatingText({ variant: "blastDamage", x: this.x, y: this.y, damage: baseDamage });
        }
        
        if (died) {
            emitCombatEnemyKilled(this);
        }
    }



    calculateSteering(target, state) {
        state.navigation.steerTo(this, target.x, target.y, NAV_PROFILES.enemyToPlayer);
    }



    shouldTriggerDodge(projectiles, flowFieldGrid, scheduler) {
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

                            if (this.isValidDodgeTarget(destX, destY, flowFieldGrid)) {
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

    isValidDodgeTarget(x, y, flowFieldGrid) {
        if (!flowFieldGrid) return true;
        const { col, row } = flowFieldGrid.worldToGrid(x, y);
        if (col >= 0 && col < flowFieldGrid.cols && row >= 0 && row < flowFieldGrid.rows) {
            return flowFieldGrid.grid[row * flowFieldGrid.cols + col] === 0;
        }
        return false;
    }

    canReposition(state) {
        return false;
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