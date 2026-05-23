import { Enemy } from "./Enemy.js";
import { Utilities } from "../Utilities.js";
import { Navigator } from "../Navigator.js";
import { FloatingText } from "../FloatingText.js";

export class Planet extends Enemy {
    constructor(x, y, radius, maxHealth) {
        super(x, y, radius, 25, maxHealth, "#4CAF50", 0, "player");
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
    }

    handleHit(damage, ctx) {
        const mitigatedAmount = damage * ctx.state.mitigation;
        const finalDamage = damage - mitigatedAmount;
        this.takeDamage(finalDamage);
        FloatingText.spawn(ctx.state, this.x, this.y - 20, `-${finalDamage.toFixed(1)}`, "#F44336");
        if (mitigatedAmount > 0) FloatingText.spawn(ctx.state, this.x, this.y + 20, `Mitigated ${mitigatedAmount.toFixed(1)}`, "#03A9F4");
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

    update(dt, gridSystem, walls, spatialHash, externalSpeedMod = 1.0) {
        if (this.isMoving && this.targetX !== null && this.targetY !== null) {
            const distToDest = Math.hypot(this.targetX - this.x, this.targetY - this.y);
            if (distToDest < 2) {
                this.x = this.targetX;
                this.y = this.targetY;
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
        
        this.speed = 25 * externalSpeedMod;
        this.applyMovement(dt); 
        this.resolveWallCollisions(walls);
    }
}