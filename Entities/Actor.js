import { DestructibleEntity } from "./Entity.js";
import { Separation } from "../Spatial/Motion/Separation.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { actorStates } from "./ActorStates.js";
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
import { resolveWeaponModeForGun, WeaponSystem } from "../Combat/WeaponSystem.js";
import { applyActorGunModifiers, getSlotFireIntervalMs } from "../Combat/gunCombat.js";
import { getGunDefinition } from "../Config/gunDefinitions.js";
import { resolveActorTurretLoadouts } from "../Config/TurretLoadoutDefinitions.js";
import {
    getTurretCountForLoadout,
    normalizeWeaponLoadout,
} from "../Combat/equipmentLoadout.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import {
    getNearestHostile,
    isValidTurretTarget,
} from "../Combat/Targeting.js";

export class Actor extends DestructibleEntity {
    constructor(x, y, radius, speed, health, color, type, accelRate = 3.0, canDamageWalls = false) {
        super(x, y, 0, health, health, false);
        this.radius = radius;
        this.mass = type === "boss" ? 200.0 : radius;
        this.speed = speed;
        this.color = color;
        this.type = type;
        this.faction = type === "player" ? "player" : "enemy";
        this.teamId = null;
        this.alwaysRunsTurretCombat = false;
        this.accelRate = accelRate;
        this.canDamageWalls = canDamageWalls;
        this.turnSpeed = 10;

        this.desiredX = 0;
        this.desiredY = 0;
        this.vx = 0;
        this.vy = 0;

        this.separation = new Separation();
        this.healthBar = null;
        this.weapon = null;
        this.stats = null;
        this.upgrades = {};
        this.baseMoveSpeed = speed;
        this.turrets = [];
        this.weaponLoadout = [];
        this.currentState = actorStates.navigating;
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

    canRunTurretCombat() {
        if (this.alwaysRunsTurretCombat) return true;
        if (this.currentState?.runsTurretCombat != null) {
            return this.currentState.runsTurretCombat;
        }
        return false;
    }

    getExternalSpeedMod(_state, options = {}) {
        return options.externalSpeedMod ?? 1;
    }

    shouldSeparateFrom(_other) {
        return true;
    }

    isAbilityOwner(state) {
        return state?.player === this;
    }

    getExplosionBlastMultipliers() {
        return this.faction === "player" ? [1, 0.5] : [1.6, 0.4];
    }

    getProjectileColorFallback() {
        return this.faction === "enemy" ? "#F44336" : "#FFEB3B";
    }

    canEraseHostileProjectiles(state) {
        return this.isAbilityOwner(state) && !!state.abilities?.["Eraser"];
    }

    updateCombat(_dt, _state, _spatialHash, _options = {}) {}

    getAITarget(state) {
        if (!state) return null;

        const aiOpts = { requireLos: false };
        const range = this.weapon?.range;
        if (range != null) {
            const inRange = getNearestHostile(state, this, range, null, aiOpts);
            if (inRange) return inRange;
        }
        return getNearestHostile(state, this, Infinity, null, aiOpts);
    }

    hasLineOfSightTo(other, stateOrWalls) {
        if (!other) return false;

        const walls = this.resolveWalls(stateOrWalls);
        if (!walls) return true;

        return Utilities.hasLineOfSight(
            this.x,
            this.y,
            other.x,
            other.y,
            walls,
            this.radius,
            other.radius ?? 0
        );
    }

    hasLineOfSightToPoint(x, y, stateOrWalls, { targetRadius = 0 } = {}) {
        const walls = this.resolveWalls(stateOrWalls);
        if (!walls) return true;

        return Utilities.hasLineOfSight(
            this.x,
            this.y,
            x,
            y,
            walls,
            this.radius,
            targetRadius
        );
    }

    blocksTurretLineOfSight(target, state) {
        return !target || !this.hasLineOfSightTo(target, state);
    }

    getExternalBlocksTargeting(state, upgrades = []) {
        if (!this.isAbilityOwner(state) || !state?.abilities || !state?.scheduler) {
            return false;
        }

        for (const upg of upgrades) {
            if (!upg.isAbility || !state.abilities[upg.id] || !upg.blocksTargeting) continue;

            const timers = state.abilityTimers[upg.id];
            if (!timers) continue;

            if (state.scheduler.getTimeRemaining(timers.activeId) > 0) {
                return true;
            }
        }

        return false;
    }

    getTurretAimPoint(turret, state, target, blocksTargeting) {
        if (this.currentState?.getAimTarget) {
            return this.currentState.getAimTarget(this, target, blocksTargeting, turret);
        }
        if (target && !blocksTargeting) {
            return target;
        }
        return this.getMovementAimPoint(state);
    }

    getMovementAimPoint(_state) {
        if (this.targetX != null && this.targetY != null && this.isMoving) {
            return {
                x: this.targetNodeX != null ? this.targetNodeX : this.targetX,
                y: this.targetNodeY != null ? this.targetNodeY : this.targetY,
            };
        }

        const desiredLen = Math.hypot(this.desiredX, this.desiredY);
        if (desiredLen > 0.001) {
            const dist = 100;
            return {
                x: this.x + (this.desiredX / desiredLen) * dist,
                y: this.y + (this.desiredY / desiredLen) * dist,
            };
        }

        const velLen = Math.hypot(this.vx, this.vy);
        if (velLen > 1) {
            const dist = 100;
            return {
                x: this.x + (this.vx / velLen) * dist,
                y: this.y + (this.vy / velLen) * dist,
            };
        }

        return null;
    }

    aimIdleTurrets(dt, state, blocksTargeting = false) {
        const effectiveBlocks = this.resolveBlocksTargeting(state, blocksTargeting);

        for (const turret of this.getTurrets()) {
            const aimTarget = this.resolveTurretAimPoint(turret, state, null, effectiveBlocks);
            if (!aimTarget) continue;
            WeaponSystem.aimTurret(turret, this.x, this.y, aimTarget.x, aimTarget.y, dt, 0);
        }
    }

    resolveTurretAimPoint(turret, state, target, blocksTargeting) {
        if (this.isTurretChargeCommitted(turret)) {
            return this.getCommittedTurretTarget(turret);
        }
        return this.getTurretAimPoint(turret, state, target, blocksTargeting);
    }

    resolveBlocksTargeting(state, externalBlocks = false) {
        if (externalBlocks) return true;
        if (this.currentState?.blocksTargeting) return true;
        if (this.currentState?.getTurretBlocksTargeting) {
            return this.currentState.getTurretBlocksTargeting(this, state);
        }
        return false;
    }

    getCommittedTurretTarget(turret) {
        const target = turret.lastTarget ?? turret.target;
        if (!target || target.isDead) return null;
        return target;
    }

    isTurretChargeCommitted(turret) {
        return turret.charge > 0 && this.getCommittedTurretTarget(turret) != null;
    }

    clearTurretCharge(turret) {
        turret.charge = 0;
        turret.lastTarget = null;
    }

    resolveTurretTargetForProcessing(turret) {
        if (this.isTurretChargeCommitted(turret)) {
            return this.getCommittedTurretTarget(turret);
        }
        return turret.target;
    }

    resolveTurretBlocksForProcessing(turret, state, externalBlocks = false) {
        if (this.isTurretChargeCommitted(turret)) {
            return false;
        }
        return this.resolveBlocksTargeting(state, externalBlocks);
    }

    canIncrementTurretCharge(turret, isAimed) {
        if (this.isTurretChargeCommitted(turret)) {
            return true;
        }
        return isAimed;
    }

    syncTurretChargeTarget(turret, target) {
        if (this.isTurretChargeCommitted(turret)) {
            return;
        }
        if (turret.lastTarget !== target) {
            this.clearTurretCharge(turret);
            turret.lastTarget = target;
        }
    }

    acquireTurretTargets(state, blocksTargeting = false) {
        const weapon = this.weapon;
        if (!weapon) return;

        const actualBlocks = this.resolveBlocksTargeting(state, blocksTargeting);
        const engagedTargets = new Set();

        for (const turret of this.getTurrets()) {
            const committed = this.isTurretChargeCommitted(turret);

            if (committed) {
                const chargeTarget = this.getCommittedTurretTarget(turret);
                if (!chargeTarget) {
                    this.clearTurretCharge(turret);
                    turret.target = null;
                } else {
                    turret.target = chargeTarget;
                }
            }

            if (turret.target && !committed) {
                const stillValid = isValidTurretTarget(
                    this,
                    turret.target,
                    state,
                    weapon.range,
                    actualBlocks,
                    { requireLos: true }
                );

                if (!stillValid) {
                    turret.target = null;
                    this.clearTurretCharge(turret);
                } else if (engagedTargets.has(turret.target)) {
                    const betterTarget = getNearestHostile(state, this, weapon.range, engagedTargets);
                    if (betterTarget) {
                        turret.target = betterTarget;
                    }
                }
            }

            if (!turret.target && !actualBlocks && !this.isTurretChargeCommitted(turret)) {
                turret.target = getNearestHostile(state, this, weapon.range, engagedTargets);
                if (!turret.target) {
                    turret.target = getNearestHostile(state, this, weapon.range);
                }
            }

            if (turret.target) {
                engagedTargets.add(turret.target);
            }
        }
    }

    updateTurrets(dt, state, { blocksTargeting = false, combatEvents = [] } = {}) {
        if (!this.weapon || this.turrets.length === 0) {
            return combatEvents;
        }

        if (this.canRunTurretCombat()) {
            this.acquireTurretTargets(state, blocksTargeting);
            this.processAllTurrets(dt, state, blocksTargeting, combatEvents);
        } else {
            this.aimIdleTurrets(dt, state, blocksTargeting);
        }

        return combatEvents;
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
            turret.ammo = undefined;
            turret.reloading = false;
            turret.reloadTimer = 0;
            turret.currentGunId = null;
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

    processAllTurrets(dt, state, blocksTargeting = false, combatEvents = []) {
        for (const turret of this.getTurrets()) {
            const gun = getGunDefinition(turret.gunId);
            const mode = resolveWeaponModeForGun(gun);
            const target = this.resolveTurretTargetForProcessing(turret);
            const turretBlocks = this.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);
            mode.processTurret(dt, state, this, gun, turret, target, turretBlocks, combatEvents);
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
            turret.render(ctx, x, y, this.radius, renderer, color, this);
        }
    }

    render(ctx, renderer, _state) {
        this.renderBody(ctx, renderer);
    }

    getSpriteCache(renderer) {
        return renderer.actorCache;
    }

    getBodySprite() {
        switch (this.type) {
            case "player":
                return RenderSprites.player;
            case "companion":
                return RenderSprites.sidekick;
            default:
                return RenderSprites.enemy;
        }
    }

    getBodySpriteCacheKey() {
        return `${this.type}_${this.radius}_${this.color}`;
    }

    getStatusBarYOffset() {
        return this.type === "player" || this.type === "companion"
            ? this.radius + 14
            : 14;
    }

    renderBody(ctx, renderer) {
        this.renderCachedSprite(
            ctx,
            this.getSpriteCache(renderer),
            this.getBodySpriteCacheKey(),
            this.getBodySprite(),
            this.radius,
            this.color
        );
    }

    renderStatusBars(ctx, renderer, _state) {
        this.renderBars(ctx, this.getSpriteCache(renderer), this.getStatusBarYOffset());
    }

    changeState(stateName, stateDataInit = null) {
        transitionEntity(this, actorStates, stateName, stateDataInit);
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

    renderBars(ctx, cache, yOffset) {
        if (this.health < this.maxHealth && this.healthBar) {
            const currentHealth = Math.max(0, this.health);
            this.healthBar.render(ctx, this.x, this.y - yOffset, currentHealth / this.maxHealth, cache);
        }
    }
}
