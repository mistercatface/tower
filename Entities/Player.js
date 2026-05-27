import { Enemy } from "./Enemy.js";
import { Utilities } from "../Utilities.js";
import { FloatingText } from "../FloatingText.js";
import { playerBaseStats } from "../Config.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { createEntityBars } from "./EntityBars.js";

const playerBars = createEntityBars({
    healthWidth: 48,
    healthHeight: 4,
    healthBorderRadius: 2,
    chargeWidth: 48,
});

export class Player extends Enemy {
    static healthBar = playerBars.healthBar;
    static chargeBar = playerBars.chargeBar;

    constructor(x, y, radius, maxHealth) {
        super(x, y, radius, playerBaseStats.moveSpeed, maxHealth, "#4CAF50", 0, "player");
        this.healthBar = Player.healthBar;
        this.chargeBar = Player.chargeBar;
        this.spawnX = x;
        this.spawnY = y;
        this.healAccumulator = 0;
        this.targetX = null;
        this.targetY = null;
        this.queuedTargetX = null;
        this.queuedTargetY = null;
        this.isMoving = false;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.mass = 50.0;
        this.moveSpeed = playerBaseStats.moveSpeed;
        this.canDamageWalls = true;
        this.startingAbilities = playerBaseStats.startingAbilities || [];
    }

    handleHit(damage, ctx, hitType) {
        this.takeDamage(damage);

        if (hitType === "blast") {
            FloatingText.spawnBlastDamageText(ctx.state, this.x, this.y, damage, 1);
        } else {
            FloatingText.spawnStandardDamageText(ctx.state, this.x, this.y, damage);
        }
    }

    setSpawnPosition(x, y) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
    }

    resetToSpawn() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.stopMovement();
        this.vx = 0;
        this.vy = 0;
    }

    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = true;
    }

    queueTarget(x, y) {
        this.queuedTargetX = x;
        this.queuedTargetY = y;
    }

    applyQueuedTarget() {
        if (this.queuedTargetX !== null && this.queuedTargetY !== null) {
            this.setTarget(this.queuedTargetX, this.queuedTargetY);
            this.queuedTargetX = null;
            this.queuedTargetY = null;
            return true;
        }
        return false;
    }

    stopMovement() {
        this.targetX = null;
        this.targetY = null;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = false;
        this.desiredX = 0;
        this.desiredY = 0;
    }
    
    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    fullHeal() {
        this.health = this.maxHealth;
    }

    updateMaxHealth(newMaxHealth) {
        this.maxHealth = newMaxHealth;
        this.health = Math.min(this.health, this.maxHealth);
    }

    addHealAccumulator(amount) {
        this.healAccumulator += amount;
        if (this.healAccumulator >= 1) {
            const healAmount = Math.floor(this.healAccumulator);
            this.heal(healAmount);
            this.healAccumulator -= healAmount;
        }
    }
    
    clearHealAccumulator() {
        this.healAccumulator = 0;
    }

    canReposition(state) {
        return state.upgrades["Reposition"] && state.upgrades["Reposition"].level > 0;
    }

    update(dt, gridSystem, walls, spatialHash, externalSpeedMod = 1.0) {
        if (this.currentState && this.currentState.customMovement) {
            this.currentState.update(this, dt, null, gridSystem, walls, null, spatialHash, null, null);
            return;
        }
        if (this.isMoving && this.targetX !== null && this.targetY !== null) {
            const toTarget = Utilities.normalizeVector(this.targetX - this.x, this.targetY - this.y);
            if (toTarget.len < 2) {
                this.stopMovement();
            } else {
                this.steerTowardPoint(this.targetX, this.targetY, gridSystem, walls, {
                    flowField: gridSystem.playerFlowField,
                    preferDirectWithLos: true,
                });
                this.targetNodeX = this.x + this.desiredX * 10;
                this.targetNodeY = this.y + this.desiredY * 10;
            }
        } else {
            this.desiredX = 0;
            this.desiredY = 0;
        }

        this.applyLocomotion(dt, walls, spatialHash, { externalSpeedMod });
    }

    renderRange(ctx, weaponRange) {
        if (weaponRange > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, weaponRange, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(76, 255, 80, 0.16)";
            ctx.fill();
        }
    }

    render(ctx, renderer, state) {
        const cache = renderer.playerCache;
        const cacheKey = `${this.radius}_${this.color}`;
        this.renderCachedSprite(ctx, cache, cacheKey, RenderSprites.player, this.radius, this.color);
        
        const chargeRatios = [];
        if (state && state.turrets && this.weapon) {
            for (const turret of state.turrets) {
                if (turret && turret.charge > 0) {
                    chargeRatios.push(turret.charge / (this.weapon.chargeTime || 1));
                }
            }
        }
        this.renderBars(ctx, cache, this.radius + 14, chargeRatios);
    }
}
