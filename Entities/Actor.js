import { DestructibleEntity } from "./Entity.js";
import { ActorRenderer } from "../Render/ActorRenderer.js";
import { applyEntityLocomotion } from "../Libraries/Motion/index.js";
import { initMobileAgent } from "../Libraries/Agent/index.js";
import { actorStates } from "./ActorStates.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { createCombatantStats, applyUpgrades, applyUpgradesToStats, syncActorCombatFromStats, initCombatantUpgradeSlots } from "./CombatantStats.js";
import { Turret } from "./Turret.js";
import { hasLineOfSight } from "../Libraries/Spatial/query/lineOfSight.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { applyActorGunModifiers, getSlotReloadTimeMs } from "../Games/tower/combat/gunCombat.js";
import { getGunDefinition } from "../Config/content/guns.js";
import { explosionSettings } from "../Config/Config.js";
import { resolveActorTurretLoadouts, applyGunTurretLoadouts, applyUpgradeTurretLoadouts } from "../Games/tower/combat/turretLoadouts.js";
import { getTurretCountForLoadout, normalizeWeaponLoadout } from "../Games/tower/combat/equipmentLoadout.js";
import { ProgressBar } from "../Libraries/Canvas/ProgressBar.js";
import { getNearestHostile } from "../Core/GamePorts.js";
import { getActorProfileForActor, getActorProfileForType } from "../Config/content/actorProfiles.js";
import { advanceActorKinematics, clearActorKinematics } from "../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { RagdollCorpse } from "./RagdollCorpse.js";
export class Actor extends DestructibleEntity {
    constructor(x, y, radius, speed, health, color, type, accelRate = 3.0, canDamageWalls = false) {
        super(x, y, 0, health, health, false);
        this.radius = radius;
        this.mass = radius;
        this.speed = speed;
        this.color = color;
        this.type = type;
        this.faction = getActorProfileForType(type).faction;
        this.teamId = null;
        this.alwaysRunsTurretCombat = false;
        this.accelRate = accelRate;
        this.canDamageWalls = canDamageWalls;
        this.turnSpeed = 10;
        initMobileAgent(this, { speed, accelRate, turnSpeed: 10, mass: this.mass, radius });
        this.healthBar = null;
        this.weapon = null;
        this.stats = null;
        this.upgrades = {};
        this.baseMoveSpeed = speed;
        this.turrets = [];
        this.weaponLoadout = [];
        this.states = actorStates;
        this.currentState = this.states.navigating;
        this.currentStateName = "navigating";
        this.stateData = {};
        this.turretController = null;
        this.renderer = new ActorRenderer(this);
    }
    setupCombatant(combatStats, upgradeDefs = null) {
        this.initCombatant(combatStats);
        if (upgradeDefs) this.initCombatantUpgradeSlots(upgradeDefs);
    }
    initCombatant(baseStats) {
        this.stats = createCombatantStats(baseStats);
        this.baseMoveSpeed = baseStats.speed ?? this.speed;
    }
    initCombatantUpgradeSlots(upgradeDefs) {
        initCombatantUpgradeSlots(this.upgrades, upgradeDefs);
    }
    initCombatWeapon() {
        this.weapon = { range: this.stats.range.baseValue, penetration: this.stats.penetration.baseValue, accuracy: this.stats.accuracy.baseValue };
    }
    setUpgradeLevel(upgradeId, level) {
        if (!this.upgrades[upgradeId]) this.upgrades[upgradeId] = { level: 0, baseLevel: 0 };
        this.upgrades[upgradeId].level = level;
        this.upgrades[upgradeId].baseLevel = level;
    }
    applySpawnUpgradeLevels(levelById, upgradeDefs) {
        for (const [upgradeId, level] of Object.entries(levelById)) if (this.upgrades[upgradeId] !== undefined) this.setUpgradeLevel(upgradeId, level);
        this.recalculateStats(upgradeDefs);
    }
    recalculateStats(upgradeDefs, { runStats = null, shouldApply = () => true, afterSync = null } = {}) {
        if (!this.stats) return;
        if (runStats) applyUpgrades(this.stats, runStats, this.upgrades, upgradeDefs, shouldApply);
        else applyUpgradesToStats(this.stats, this.upgrades, upgradeDefs, shouldApply);
        syncActorCombatFromStats(this, this.stats, this.baseMoveSpeed);
        afterSync?.(this);
    }
    getTurrets() {
        return this.turrets;
    }
    canRunTurretCombat() {
        if (this.alwaysRunsTurretCombat) return true;
        if (this.currentState?.runsTurretCombat != null) return this.currentState.runsTurretCombat;
        return false;
    }
    getExternalSpeedMod(_state, options = {}) {
        return options.externalSpeedMod ?? 1;
    }
    isAbilityOwner(state) {
        return state?.player === this;
    }
    getExplosionBlastMultipliers() {
        return this.faction === "player" ? explosionSettings.playerMultipliers : explosionSettings.enemyMultipliers;
    }
    getProjectileColorFallback() {
        return getActorProfileForActor(this).projectileColor;
    }
    getKinematicsCamera(state) {
        return { x: this.x, y: this.y };
    }
    updateCombat(dt, state, spatialFrame, options = {}) {
        this.updateLocomotion(dt, state, spatialFrame, options);
        if (this.type === "player" && state.abilities["Shoot"])
            for (const turret of this.getTurrets()) {
                if (turret.manualFireCooldown === undefined) turret.manualFireCooldown = 0;
                if (turret.manualFireCooldown > 0) turret.manualFireCooldown -= dt;
            }
        const combatEvents = options.combatEvents ?? [];
        const events = this.turretController?.updateTurretCombat(dt, state, { ...options, combatEvents }) ?? combatEvents;
        if (this.usesKinematicsBody) {
            this._kinematicsCamera = this.getKinematicsCamera(state);
            advanceActorKinematics(this, dt, this._kinematicsCamera);
        }
        return events;
    }
    updateLocomotion(_dt, _state, _spatialFrame, _options = {}) {
        // Subclasses implement movement; turret combat runs in updateCombat.
    }
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
        const wallCtx = this.resolveWallContext(stateOrWalls);
        if (!wallCtx) return true;
        return hasLineOfSight(this.x, this.y, other.x, other.y, wallCtx, this.radius, other.radius ?? 0);
    }
    hasLineOfSightToPoint(x, y, stateOrWalls, { targetRadius = 0 } = {}) {
        const wallCtx = this.resolveWallContext(stateOrWalls);
        if (!wallCtx) return true;
        return hasLineOfSight(this.x, this.y, x, y, wallCtx, this.radius, targetRadius);
    }
    syncTurretCount(count, turnSpeed) {
        const targetCount = Math.max(0, Math.floor(count));
        while (this.turrets.length < targetCount) {
            const newAngle = targetCount > 0 ? (this.turrets.length / targetCount) * Math.PI * 2 : 0;
            this.turrets.push(new Turret(newAngle, turnSpeed));
        }
        while (this.turrets.length > targetCount) this.turrets.pop();
        this.setTurretTurnSpeed(turnSpeed);
    }
    setTurretTurnSpeed(turnSpeed) {
        for (const turret of this.turrets) turret.turnSpeed = turnSpeed;
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
        applyGunTurretLoadouts(this);
        if (resolveContext?.state) applyUpgradeTurretLoadouts(this, resolveContext.state, resolveContext.upgradeDefs ?? resolveContext.state.upgradeDefs);
        applyActorGunModifiers(this);
    }
    manualFire(state, targetX, targetY) {
        this.turretController?.manualFire(state, targetX, targetY);
    }
    recalculateFromRun(state, upgradeDefs, shouldApply = () => true) {
        this.recalculateStats(upgradeDefs, {
            runStats: state.runStats,
            shouldApply,
            afterSync: (actor) => {
                if (actor.weaponLoadout.length > 0) actor.applyWeaponLoadout(actor.weaponLoadout, { state, upgradeDefs });
                else resolveActorTurretLoadouts(actor, state, upgradeDefs);
            },
        });
    }
    onDamageFloatingText(damage, hitType) {
        if (hitType === "blast") spawnFloatingText({ variant: "blastDamage", x: this.x, y: this.y, damage });
    }
    onHitAfterDamage(damage, ctx, hitType, died, event) {
        CombatParticles.spawnBloodForActorHit(ctx?.state, this, damage, hitType, died, event);
        if (event?.projectile && !this.usesKinematicsBody) CombatParticles.spawnImpactSparks(ctx?.state, event.projectile.x, event.projectile.y, { impactAngle: event.projectile.angle });
        if (died && this.usesKinematicsBody) this.spawnRagdollOnDeath(ctx.state, event);
    }
    handleHit(damage, ctx, hitType, event) {
        const died = this.takeDamage(damage);
        this.onDamageFloatingText(damage, hitType);
        this.onHitAfterDamage(damage, ctx, hitType, died, event);
        return died;
    }
    spawnRagdollOnDeath(state, event) {
        if (!state) return;
        const camera = this._kinematicsCamera ?? { x: this.x, y: this.y };
        RagdollCorpse.spawnFromActor(state, this, event, camera);
        clearActorKinematics(this);
    }
    renderCombatHudClassic(ctx, renderer) {
        this.renderer.renderCombatHudClassic(ctx, renderer);
    }
    render(ctx, renderer, _state) {
        this.renderBody(ctx, renderer);
    }
    getSpriteCache(renderer) {
        return renderer.actorCache;
    }
    getStatusBarYOffset() {
        return getActorProfileForActor(this).statusBarOffset(this.radius);
    }
    renderBody(_ctx, _renderer) {
        // Subclasses draw kinematics bodies.
    }
    renderStatusBars(ctx, renderer, state) {
        this.renderer.renderStatusBars(ctx, renderer, state);
    }
    changeState(stateName, stateDataInit = null) {
        transitionEntity(this, this.states, stateName, stateDataInit);
    }
    hasLocomotionIntent() {
        return this.isMoving || Math.hypot(this.desiredX ?? 0, this.desiredY ?? 0) > 0.05 || (this.targetX != null && this.targetY != null);
    }
    applyLocomotion(dt, spatialFrame, { state = null, externalSpeedMod = 1, ignoreSeparationInDesired = false, shouldMove = true, alignAngleWithMovement = true } = {}) {
        applyEntityLocomotion(this, dt, spatialFrame, {
            externalSpeedMod,
            ignoreSeparationInDesired,
            shouldMove,
            alignAngleWithMovement,
            resolveAlignAngle: (actor, requested) => {
                if (!requested) return false;
                const armed = normalizeWeaponLoadout(actor.weaponLoadout ?? []).length > 0;
                return !armed || actor.hasLocomotionIntent();
            },
            resolveWalls: state?.wallResolver ? (entity, frame) => state.wallResolver.resolve(entity, frame) : null,
        });
    }
    changeStateAndUpdate(stateName, stateDataInit, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, gameState) {
        this.changeState(stateName, stateDataInit);
        if (this.currentState?.update) return this.currentState.update(this, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, gameState);
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
    getStunBarProgress() {
        if (this.currentState?.getStunBarProgress) return this.currentState.getStunBarProgress(this);
        return null;
    }
    get reloadBar() {
        if (!this._reloadBar && this.healthBar) this._reloadBar = new ProgressBar({ width: this.healthBar.width, height: 2, borderRadius: 1, quantizationSteps: 30, colorFn: () => "#FF9800" });
        return this._reloadBar;
    }
    getReloadBarProgress() {
        for (const turret of this.turrets)
            if (turret.reloading) {
                const gun = turret.gun ?? getGunDefinition(turret.gunId);
                const reloadTimeMs = getSlotReloadTimeMs(gun, this);
                if (reloadTimeMs > 0) return Math.min(1, turret.reloadTimer / reloadTimeMs);
            }
        return null;
    }
}
