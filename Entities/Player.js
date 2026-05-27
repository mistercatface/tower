import { Enemy } from "./Enemy.js";
import { Utilities } from "../Utilities.js";
import { Navigator } from "../Spatial/Navigator.js";
import { FloatingText } from "../FloatingText.js";
import { PhysicsSystem } from "../Spatial/PhysicsSystem.js";
import { playerBaseStats } from "../Config.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { ProgressBar } from "../Render/ProgressBar.js";

export class Player extends Enemy {
    static healthBar = new ProgressBar({
        width: 48,
        height: 4,
        borderRadius: 2,
        quantizationSteps: 20
    });

    constructor(x, y, radius, maxHealth) {
        super(x, y, radius, playerBaseStats.moveSpeed, maxHealth, "#4CAF50", 0, "player");
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

        let text = `-${damage.toFixed(1)}`;
        const isBlast = (hitType === "blast");
        if (isBlast) {
            text += " BLAST";
            FloatingText.spawn(ctx.state, this.x, this.y - 20, text, "#FF5722", "blast", {
                vx: (Math.random() - 0.5) * 80,
                vy: -95 - Math.random() * 40,
                gravity: 200,
                duration: 1200
            });
        } else {
            FloatingText.spawn(ctx.state, this.x, this.y - 20, text, "#F44336", "standard", {
                vx: (Math.random() - 0.5) * 30,
                vy: -40 - Math.random() * 20,
                gravity: 80,
                duration: 900
            });
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
            const distToDest = Math.hypot(this.targetX - this.x, this.targetY - this.y);
            if (distToDest < 2) {
                this.stopMovement();
            } else {
                let dirX = (this.targetX - this.x) / distToDest;
                let dirY = (this.targetY - this.y) / distToDest;

                if (!Utilities.hasLineOfSight(this.x, this.y, this.targetX, this.targetY, walls, this.radius)) {
                    const angle = Navigator.getSteeringAngle(this.x, this.y, gridSystem, gridSystem.playerFlowField);
                    if (angle !== null) {
                        dirX = Math.cos(angle);
                        dirY = Math.sin(angle);
                    }
                }

                this.desiredX = dirX;
                this.desiredY = dirY;
                this.targetNodeX = this.x + dirX * 10;
                this.targetNodeY = this.y + dirY * 10;
            }
        } else {
            this.desiredX = 0;
            this.desiredY = 0;
        }

        this.separation.update(this, spatialHash);
        
        this.speed = this.moveSpeed * externalSpeedMod;
        PhysicsSystem.applyMovement(this, dt); 
        PhysicsSystem.resolveWallCollisions(this, walls);
    }

    renderRange(ctx, weaponRange) {
        if (weaponRange > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, weaponRange, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(76, 255, 80, 0.16)";
            ctx.fill();
        }
    }

    render(ctx, renderer) {
        const cache = renderer.playerCache;
        const cacheKey = `${this.radius}_${this.color}`;
        this.renderCachedSprite(ctx, cache, cacheKey, RenderSprites.player, this.radius, this.color);
        
        if (this.health < this.maxHealth) {
            const currentHealth = Math.max(0, this.health);
            Player.healthBar.render(ctx, this.x, this.y - (this.radius + 14), currentHealth / this.maxHealth, cache);
        }
    }
}