import { Actor } from "./Actor.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { playerBaseStats, NAV_PROFILES, navigationSettings } from "../Config/Config.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { createEntityBars } from "./EntityBars.js";
import { Turret } from "./Turret.js";

const playerBars = createEntityBars({
    healthWidth: 48,
    healthHeight: 4,
    healthBorderRadius: 2,
    chargeWidth: 48,
});

export class Player extends Actor {
    static healthBar = playerBars.healthBar;
    static chargeBar = playerBars.chargeBar;

    constructor(x, y, radius) {
        super(x, y, radius, playerBaseStats.speed, playerBaseStats.maxHealth, "#4CAF50", "player", 3.0, true);
        this.setupCombatant(playerBaseStats);
        this.initCombatWeapon({ linkAccuracyToStats: true });
        this.healthBar = Player.healthBar;
        this.chargeBar = Player.chargeBar;
        this.spawnX = x;
        this.spawnY = y;
        this.healAccumulator = 0;
        this.targetX = null;
        this.targetY = null;
        this.targetGridCol = null;
        this.targetGridRow = null;
        this.queuedTargetX = null;
        this.queuedTargetY = null;
        this.queuedTargetCol = null;
        this.queuedTargetRow = null;
        this.isMoving = false;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.mass = 50.0;
        this.canDamageWalls = true;
        this.startingAbilities = playerBaseStats.startingAbilities || [];
        this.turrets = [];
    }

    recalculate(state, upgradeDefs, shouldApply = () => true) {
        this.recalculateStats(upgradeDefs, {
            runStats: state.runStats,
            shouldApply,
            afterSync: (player) => {
                player.syncTurrets(state.runStats);
                if (upgradeDefs) {
                    for (const upg of upgradeDefs) {
                        if (upg.isAbility && state.abilities?.[upg.id] && upg.abilityApplyFn) {
                            upg.abilityApplyFn(player.weapon, player);
                        }
                    }
                }
            },
        });

        state.selectedSpeed = Math.min(state.selectedSpeed, state.runStats.gameSpeed.value);
    }

    syncTurrets(runStats) {
        const turnSpeed = this.stats.turnSpeed.value;
        const targetTurretCount = Math.floor(runStats.turretCount.value);

        while (this.turrets.length < targetTurretCount) {
            const newAngle = (this.turrets.length / targetTurretCount) * Math.PI * 2;
            this.turrets.push(new Turret(newAngle, turnSpeed));
        }
        while (this.turrets.length > targetTurretCount) {
            this.turrets.pop();
        }
        this.turrets.forEach((turret) => {
            turret.turnSpeed = turnSpeed;
        });
    }

    handleHit(damage, ctx, hitType) {
        this.takeDamage(damage);

        if (hitType === "blast") {
            spawnFloatingText({ variant: "blastDamage", x: this.x, y: this.y, damage });
        } else {
            spawnFloatingText({ variant: "standardDamage", x: this.x, y: this.y, damage });
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

    hasReachedTarget(flowFieldGrid) {
        if (this.targetGridCol !== null && this.targetGridRow !== null && flowFieldGrid) {
            return flowFieldGrid.entityIntersectsCell(
                this.x,
                this.y,
                this.radius,
                this.targetGridCol,
                this.targetGridRow
            );
        }
        if (this.targetX === null || this.targetY === null) {
            return false;
        }
        return Math.hypot(this.x - this.targetX, this.y - this.targetY) < navigationSettings.arrivalDistance;
    }

    setTarget(x, y, state = null, targetCell = null) {
        this.targetX = x;
        this.targetY = y;
        this.targetGridCol = targetCell?.col ?? null;
        this.targetGridRow = targetCell?.row ?? null;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = true;
        state?.navigation?.clear(this);
    }

    queueTarget(x, y, targetCell = null) {
        this.queuedTargetX = x;
        this.queuedTargetY = y;
        this.queuedTargetCol = targetCell?.col ?? null;
        this.queuedTargetRow = targetCell?.row ?? null;
    }

    applyQueuedTarget(state = null) {
        if (this.queuedTargetX !== null && this.queuedTargetY !== null) {
            const targetCell = this.queuedTargetCol !== null && this.queuedTargetRow !== null
                ? { col: this.queuedTargetCol, row: this.queuedTargetRow }
                : null;
            this.setTarget(this.queuedTargetX, this.queuedTargetY, state, targetCell);
            this.queuedTargetX = null;
            this.queuedTargetY = null;
            this.queuedTargetCol = null;
            this.queuedTargetRow = null;
            return true;
        }
        return false;
    }

    stopMovement(state = null) {
        this.targetX = null;
        this.targetY = null;
        this.targetGridCol = null;
        this.targetGridRow = null;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = false;
        this.desiredX = 0;
        this.desiredY = 0;
        state?.navigation?.clear(this);
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
        return this.upgrades["Reposition"] && this.upgrades["Reposition"].level > 0;
    }

    update(dt, flowFieldGrid, walls, spatialHash, state, externalSpeedMod = 1.0) {
        if (this.currentState && this.currentState.customMovement) {
            this.currentState.update(this, dt, null, flowFieldGrid, walls, null, spatialHash, null, null);
            return;
        }
        if (this.isMoving && this.targetX !== null && this.targetY !== null) {
            if (this.hasReachedTarget(flowFieldGrid)) {
                this.stopMovement(state);
            } else {
                state.navigation.steerTo(this, this.targetX, this.targetY, NAV_PROFILES.playerClick, flowFieldGrid);
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

    renderStatusBars(ctx, renderer, _state) {
        super.renderStatusBars(ctx, renderer.playerCache, this.radius + 14);
    }

    render(ctx, renderer, state) {
        const cache = renderer.playerCache;
        const cacheKey = `${this.radius}_${this.color}`;
        this.renderCachedSprite(ctx, cache, cacheKey, RenderSprites.player, this.radius, this.color);
    }
}
