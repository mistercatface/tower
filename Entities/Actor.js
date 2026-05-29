import { DestructibleEntity } from "./Entity.js";
import { Separation } from "../Spatial/Motion/Separation.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { enemyStates } from "./EnemyStates.js";
import { transitionEntity } from "./EntityFsm.js";
import {
    createCombatantStats,
    applyUpgrades,
    applyUpgradesToStats,
    syncActorCombatFromStats,
    initCombatantUpgradeSlots,
} from "./CombatantStats.js";
import { Turret } from "./Turret.js";
import { Utilities } from "../Core/Utilities.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { resolveWeaponModeForGun } from "../Combat/WeaponSystem.js";
import { applyActorGunModifiers, getSlotFireIntervalMs } from "../Combat/gunCombat.js";
import { getGunDefinition } from "../Config/gunDefinitions.js";
import { resolveActorTurretLoadouts } from "../Config/TurretLoadoutDefinitions.js";
import {
    getTurretCountForLoadout,
    normalizeWeaponLoadout,
} from "../Combat/equipmentLoadout.js";

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
        this.stats = null;
        this.upgrades = {};
        this.baseMoveSpeed = speed;
        this.turrets = [];
        this.weaponLoadout = [];
        this.currentState = enemyStates.navigating;
        this.currentStateName = "navigating";
        this.stateData = {};
    }

    setupCombatant(combatStats, upgradeDefs = null) {
        this.initCombatant(combatStats);
        if (upgradeDefs) {
            this.initCombatantUpgradeSlots(upgradeDefs);
        }
    }

    initCombatant(baseStats) {
        this.stats = createCombatantStats(baseStats);
        this.baseMoveSpeed = baseStats.speed ?? this.speed;
    }

    initCombatantUpgradeSlots(upgradeDefs) {
        initCombatantUpgradeSlots(this.upgrades, upgradeDefs);
    }

    initCombatWeapon() {
        this.weapon = {
            range: this.stats.range.baseValue,
            penetration: this.stats.penetration.baseValue,
            accuracy: this.stats.accuracy.baseValue,
        };
    }

    setUpgradeLevel(upgradeId, level) {
        if (!this.upgrades[upgradeId]) {
            this.upgrades[upgradeId] = { level: 0, baseLevel: 0 };
        }
        this.upgrades[upgradeId].level = level;
        this.upgrades[upgradeId].baseLevel = level;
    }

    applySpawnUpgradeLevels(levelById, upgradeDefs) {
        for (const [upgradeId, level] of Object.entries(levelById)) {
            if (this.upgrades[upgradeId] !== undefined) {
                this.setUpgradeLevel(upgradeId, level);
            }
        }
        this.recalculateStats(upgradeDefs);
    }

    recalculateStats(upgradeDefs, { runStats = null, shouldApply = () => true, afterSync = null } = {}) {
        if (!this.stats) return;

        if (runStats) {
            applyUpgrades(this.stats, runStats, this.upgrades, upgradeDefs, shouldApply);
        } else {
            applyUpgradesToStats(this.stats, this.upgrades, upgradeDefs, shouldApply);
        }

        syncActorCombatFromStats(this, this.stats, this.baseMoveSpeed);
        afterSync?.(this);
    }

    getTurrets() {
        return this.turrets;
    }

    syncTurretCount(count, turnSpeed) {
        const targetCount = Math.max(0, Math.floor(count));

        while (this.turrets.length < targetCount) {
            const newAngle = targetCount > 0 ? (this.turrets.length / targetCount) * Math.PI * 2 : 0;
            this.turrets.push(new Turret(newAngle, turnSpeed));
        }
        while (this.turrets.length > targetCount) {
            this.turrets.pop();
        }

        this.setTurretTurnSpeed(turnSpeed);
    }

    setTurretTurnSpeed(turnSpeed) {
        for (const turret of this.turrets) {
            turret.turnSpeed = turnSpeed;
        }
    }

    resetTurretCombatState() {
        for (const turret of this.turrets) {
            turret.charge = 0;
            turret.target = null;
            turret.lastTarget = null;
            turret.currentLaserLength = 0;
            turret.laserTimer = 0;
        }
    }

    applyWeaponLoadout(gunIds, resolveContext) {
        const loadout = normalizeWeaponLoadout(gunIds);
        this.weaponLoadout = loadout;
        const turnSpeed = this.stats?.turnSpeed?.value ?? this.turnSpeed;
        this.syncTurretCount(getTurretCountForLoadout(loadout), turnSpeed);

        if (resolveContext?.state) {
            resolveActorTurretLoadouts(
                this,
                resolveContext.state,
                resolveContext.upgradeDefs ?? resolveContext.state.upgradeDefs
            );
        } else {
            for (let i = 0; i < loadout.length; i++) {
                this.turrets[i].gunId = loadout[i];
            }
            applyActorGunModifiers(this);
        }
    }

    turnAllTurretsTowards(targetAngle, dt) {
        for (const turret of this.getTurrets()) {
            turret.angle = Utilities.turnAngleTowards(turret.angle, targetAngle, turret.turnSpeed, dt);
        }
    }

    processAllTurrets(dt, state, targetResolver, blocksTargeting, combatEvents = []) {
        const resolveTarget =
            typeof targetResolver === "function" ? targetResolver : () => targetResolver;

        for (const turret of this.getTurrets()) {
            const gun = getGunDefinition(turret.gunId);
            const mode = resolveWeaponModeForGun(gun);
            const target = resolveTarget(turret);
            mode.processTurret(dt, state, this, gun, turret, target, blocksTargeting, combatEvents);
        }

        return combatEvents;
    }

    recalculateFromRun(state, upgradeDefs, shouldApply = () => true) {
        this.recalculateStats(upgradeDefs, {
            runStats: state.runStats,
            shouldApply,
            afterSync: (actor) => {
                if (actor.weaponLoadout.length > 0) {
                    actor.applyWeaponLoadout(actor.weaponLoadout, { state, upgradeDefs });
                } else {
                    resolveActorTurretLoadouts(actor, state, upgradeDefs);
                }
            },
        });
    }

    onDamageFloatingText(damage, hitType) {
        if (hitType === "blast") {
            spawnFloatingText({ variant: "blastDamage", x: this.x, y: this.y, damage });
        }
    }

    onHitAfterDamage(_damage, _ctx, _hitType, _died) {}

    handleHit(damage, ctx, hitType) {
        const died = this.takeDamage(damage);
        this.onDamageFloatingText(damage, hitType);
        this.onHitAfterDamage(damage, ctx, hitType, died);
        return died;
    }

    renderTurrets(ctx, renderer, color = this.color) {
        this.renderTurretsAt(ctx, renderer, this.x, this.y, color);
    }

    renderTurretsAt(ctx, renderer, x, y, color = this.color) {
        for (const turret of this.turrets) {
            turret.render(ctx, x, y, this.radius, renderer, color);
        }
    }

    getChargeRatios() {
        const ratios = [];

        for (const turret of this.turrets) {
            if (turret.charge <= 0) continue;
            const gun = getGunDefinition(turret.gunId);
            const fireIntervalMs = getSlotFireIntervalMs(gun, this);
            if (fireIntervalMs > 0) {
                ratios.push(turret.charge / fireIntervalMs);
            }
        }

        return ratios;
    }

    renderStatusBars(ctx, cache, yOffset) {
        this.renderBars(ctx, cache, yOffset, this.getChargeRatios());
    }

    changeState(stateName, stateDataInit = null) {
        transitionEntity(this, enemyStates, stateName, stateDataInit);
    }

    changeStateAndUpdate(stateName, stateDataInit, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, gameState) {
        this.changeState(stateName, stateDataInit);
        if (this.currentState?.update) {
            return this.currentState.update(this, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, gameState);
        }
        return false;
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
