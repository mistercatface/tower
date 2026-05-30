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
    areHostile,
    getNearestHostile,
    getPlayerActors,
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

    shouldApplyAllyLaneAvoidance(_state) {
        return true;
    }

    getFriendlyActors(state) {
        if (!state?.getCombatants) return [];

        return state.getCombatants().filter(
            (other) => other !== this && !other.isDead && !areHostile(this, other)
        );
    }

    isAllyMoving(ally) {
        if (!ally || ally.isDead) return false;
        if (ally.isMoving) return true;
        if (Math.hypot(ally.desiredX, ally.desiredY) > 0.08) return true;
        if (ally.speed > 0 && Math.hypot(ally.vx, ally.vy) > ally.speed * 0.15) return true;
        return false;
    }

    getAllyLaneLines(state) {
        const lines = [];

        for (const ally of this.getFriendlyActors(state)) {
            const seenTargets = new Set();
            for (const target of this.getEngagedTargetsFrom(ally)) {
                if (seenTargets.has(target)) continue;
                seenTargets.add(target);
                lines.push({
                    fromX: ally.x,
                    fromY: ally.y,
                    toX: target.x,
                    toY: target.y,
                    endRadius: target.radius ?? 0,
                    sourceRadius: ally.radius,
                });
            }

            if (!this.isAllyMoving(ally)) continue;

            const aim = ally.getMovementAimPoint(state);
            if (!aim) continue;

            lines.push({
                fromX: ally.x,
                fromY: ally.y,
                toX: aim.x,
                toY: aim.y,
                endRadius: 0,
                sourceRadius: ally.radius,
            });
        }

        return lines;
    }

    blocksAllyLane(line, { minT = 0.03, maxT = 0.97, padding = 4 } = {}) {
        const corridor = line.sourceRadius + line.endRadius + this.radius + padding;
        const closest = Utilities.closestPointOnSegment(
            this.x,
            this.y,
            line.fromX,
            line.fromY,
            line.toX,
            line.toY
        );
        if (closest.t < minT || closest.t > maxT) return false;
        const dist = Math.hypot(this.x - closest.x, this.y - closest.y);
        return dist < corridor;
    }

    computeAllyLaneAvoidanceBias(state) {
        let avoidX = 0;
        let avoidY = 0;

        for (const line of this.getAllyLaneLines(state)) {
            if (!this.blocksAllyLane(line)) continue;

            const closest = Utilities.closestPointOnSegment(
                this.x,
                this.y,
                line.fromX,
                line.fromY,
                line.toX,
                line.toY
            );
            let pushX = this.x - closest.x;
            let pushY = this.y - closest.y;
            let pushLen = Math.hypot(pushX, pushY);

            if (pushLen < 0.001) {
                const dx = line.toX - line.fromX;
                const dy = line.toY - line.fromY;
                const lineLen = Math.hypot(dx, dy) || 1;
                pushX = -dy / lineLen;
                pushY = dx / lineLen;
                pushLen = 1;
            }

            const corridor = line.sourceRadius + line.endRadius + this.radius + 4;
            const dist = Math.hypot(this.x - closest.x, this.y - closest.y);
            const strength = Math.min(1, (corridor - dist) / corridor);

            avoidX += (pushX / pushLen) * strength;
            avoidY += (pushY / pushLen) * strength;
        }

        const len = Math.hypot(avoidX, avoidY);
        if (len < 0.001) {
            return { x: 0, y: 0 };
        }

        return { x: avoidX / len, y: avoidY / len };
    }

    applyAllyLaneAvoidance(state, { weight = 0.8 } = {}) {
        if (!state || !this.shouldApplyAllyLaneAvoidance(state)) return;

        const bias = this.computeAllyLaneAvoidanceBias(state);
        if (bias.x === 0 && bias.y === 0) return;

        const desiredLen = Math.hypot(this.desiredX, this.desiredY);
        if (desiredLen > 0.001) {
            this.desiredX = this.desiredX * (1 - weight) + bias.x * weight;
            this.desiredY = this.desiredY * (1 - weight) + bias.y * weight;
        } else {
            this.desiredX = bias.x;
            this.desiredY = bias.y;
        }

        const len = Math.hypot(this.desiredX, this.desiredY);
        if (len > 1) {
            this.desiredX /= len;
            this.desiredY /= len;
        }
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

    updateCombat(_dt, _state, _spatialHash, _options = {}) {
        // Subclasses run movement, then call updateTurretCombat.
    }

    updateTurretCombat(dt, state, options = {}) {
        if (!this.weapon || this.turrets.length === 0) {
            return options.combatEvents ?? [];
        }

        const blocksTargeting =
            options.blocksTargeting || this.getExternalBlocksTargeting(state, options.upgrades ?? []);
        const combatEvents = options.combatEvents ?? [];

        if (this.canRunTurretCombat()) {
            this.acquireTurretTargets(state, blocksTargeting);
            this.processAllTurrets(dt, state, blocksTargeting, combatEvents);
        } else {
            this.aimIdleTurrets(dt, state, blocksTargeting);
        }

        return combatEvents;
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

    getAllyActors(state) {
        if (!state) return [];

        let allies = [];
        if (this.teamId != null) {
            allies = state.getCombatants().filter(
                (other) =>
                    other !== this &&
                    !other.isDead &&
                    other.teamId === this.teamId &&
                    !areHostile(this, other)
            );
        }

        if (allies.length === 0 && this.faction === "player") {
            allies = getPlayerActors(state).filter((ally) => ally !== this && !ally.isDead);
        }

        return allies;
    }

    getEngagedTargetsFrom(ally) {
        const targets = [];

        for (const turret of ally.getTurrets()) {
            if (turret.target && !turret.target.isDead) {
                targets.push(turret.target);
            }
            if (ally.isTurretChargeCommitted(turret)) {
                const committed = ally.getCommittedTurretTarget(turret);
                if (committed && !committed.isDead) {
                    targets.push(committed);
                }
            }
        }

        return targets;
    }

    getMutualAssistTargets(state) {
        const targets = [];
        const seen = new Set();

        for (const ally of this.getAllyActors(state)) {
            for (const target of this.getEngagedTargetsFrom(ally)) {
                if (seen.has(target)) continue;
                seen.add(target);
                targets.push(target);
            }
        }

        return targets;
    }

    isTargetEngagedBy(ally, target) {
        if (!ally || !target || target.isDead) return false;
        return this.getEngagedTargetsFrom(ally).includes(target);
    }

    isMutualAssistTarget(state, target) {
        if (!target) return false;
        return this.getMutualAssistTargets(state).includes(target);
    }

    getMutualAssistRangeBonus(state, target) {
        if (!target || !state || !this.isMutualAssistTarget(state, target)) {
            return 0;
        }

        let bonus = 0;
        for (const ally of this.getAllyActors(state)) {
            if (!this.isTargetEngagedBy(ally, target)) continue;
            bonus = Math.max(bonus, Math.hypot(ally.x - this.x, ally.y - this.y));
        }
        return bonus;
    }

    getEffectiveTurretRange(state, target) {
        const baseRange = this.weapon?.range ?? 0;
        if (!target) return baseRange;
        return baseRange + this.getMutualAssistRangeBonus(state, target);
    }

    isValidTurretTargetForSelf(target, state, { blocksTargeting = false } = {}) {
        if (!this.weapon || !target) return false;
        return isValidTurretTarget(
            this,
            target,
            state,
            this.getEffectiveTurretRange(state, target),
            blocksTargeting,
            { requireLos: true }
        );
    }

    buildIndependentTargetExclusions(ownExcluded, state) {
        const excluded = new Set(ownExcluded ?? []);

        for (const target of this.getMutualAssistTargets(state)) {
            excluded.add(target);
        }

        return excluded;
    }

    findIndependentTurretTarget(state, ownExcluded) {
        if (!this.weapon) return null;

        return getNearestHostile(
            state,
            this,
            this.weapon.range,
            this.buildIndependentTargetExclusions(ownExcluded, state)
        );
    }

    findTurretTarget(state, ownExcluded) {
        if (!this.weapon) return null;

        const ownExcludedSet = ownExcluded ?? new Set();
        const allyEngaged = this.getMutualAssistTargets(state);

        const independent = this.findIndependentTurretTarget(state, ownExcludedSet);
        if (independent) return independent;

        for (const target of allyEngaged) {
            if (ownExcludedSet.has(target)) continue;
            if (this.isValidTurretTargetForSelf(target, state)) {
                return target;
            }
        }

        const shared = getNearestHostile(state, this, this.weapon.range, ownExcludedSet);
        if (shared) return shared;

        for (const target of allyEngaged) {
            if (ownExcludedSet.has(target)) continue;
            if (this.isValidTurretTargetForSelf(target, state)) {
                return target;
            }
        }

        return getNearestHostile(state, this, this.weapon.range);
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
                const stillValid = this.isValidTurretTargetForSelf(
                    turret.target,
                    state,
                    { blocksTargeting: actualBlocks }
                );

                if (!stillValid) {
                    turret.target = null;
                    this.clearTurretCharge(turret);
                } else {
                    const independent = this.findIndependentTurretTarget(state, engagedTargets);
                    if (independent && independent !== turret.target) {
                        turret.target = independent;
                    } else if (engagedTargets.has(turret.target)) {
                        const betterTarget = this.findTurretTarget(state, engagedTargets);
                        if (betterTarget) {
                            turret.target = betterTarget;
                        }
                    }
                }
            }

            if (!turret.target && !actualBlocks && !this.isTurretChargeCommitted(turret)) {
                turret.target = this.findTurretTarget(state, engagedTargets);
            }

            if (turret.target) {
                engagedTargets.add(turret.target);
            }
        }
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
        if (state) {
            this.applyAllyLaneAvoidance(state);
        }

        this.separation.update(this, spatialHash);
        const baseSpeed = this.speed;
        if (externalSpeedMod !== 1) {
            this.speed = baseSpeed * externalSpeedMod;
        }
        PhysicsSystem.applyMovement(this, dt, ignoreSeparationInDesired, shouldMove, alignAngleWithMovement);
        if (externalSpeedMod !== 1) {
            this.speed = baseSpeed;
        }
        return PhysicsSystem.resolveWallCollisions(this, walls, state);
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
