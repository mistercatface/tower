import { DestructibleEntity } from "./Entity.js";
import { Separation } from "../Spatial/Motion/Separation.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { enemyStates } from "./EnemyStates.js";

export class Actor extends DestructibleEntity {
    constructor(x, y, radius, speed, health, color, type, accelRate = 3.0, canDamageWalls = false) {
        super(x, y, 0, health, health, false);
        this.radius = radius;
        this.mass = type === "boss" ? 200.0 : radius;
        this.speed = speed;
        this.color = color;
        this.type = type;
        this.accelRate = accelRate;
        this.canDamageWalls = canDamageWalls;
        this.turnSpeed = 10;
        
        this.desiredX = 0;
        this.desiredY = 0;
        this.vx = 0;
        this.vy = 0;
        
        this.separation = new Separation();
        this.healthBar = null;
        this.chargeBar = null;
        this.weapon = null;
        this.currentState = enemyStates.navigating;
        this.stateData = {};
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
}
