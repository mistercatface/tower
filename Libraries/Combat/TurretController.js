import { normalizeAngle } from "../Math/Angle.js";
import { resolveWeaponModeForGun, WeaponSystem } from "./WeaponSystem.js";
import { getSlotFireIntervalMs } from "./gunCombat.js";
import { Laser } from "./Laser.js";
import { getBeamTickDamage, createBeamHitSource } from "./impactDamage.js";
import { getGunDefinition } from "./gunDefaults.js";
import { sandboxTargeting } from "./sandboxTargeting.js";
import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { advanceTurretAmmo } from "./turretAmmo.js";
export class TurretController {
    constructor(actor) {
        this.actor = actor;
    }
    updateTurretCombat(dt, state, options = {}) {
        const weaponLoadout = normalizeWeaponLoadout(this.actor.weaponLoadout ?? []);
        if (weaponLoadout.length === 0 || !this.actor.turrets || this.actor.turrets.length === 0) return options.combatEvents ?? [];
        const blocksTargeting = options.blocksTargeting || this.getExternalBlocksTargeting(state);
        const combatEvents = options.combatEvents ?? [];
        const canRunTurretCombat = typeof this.actor.canRunTurretCombat === "function" ? this.actor.canRunTurretCombat() : !this.actor.isDead;
        if (canRunTurretCombat) {
            this.acquireTurretTargets(state, blocksTargeting);
            this.processAllTurrets(dt, state, blocksTargeting, combatEvents);
        } else this.aimIdleTurrets(dt, state, blocksTargeting);
        return combatEvents;
    }
    blocksTurretLineOfSight(target, state) {
        if (!target) return true;
        if (typeof this.actor.hasLineOfSightTo === "function") return !this.actor.hasLineOfSightTo(target, state);
        return false;
    }
    getAllyActors(state) {
        if (!state) return [];
        const myFaction = sandboxTargeting.inferFaction(this.actor);
        return sandboxTargeting
            .getBroadphaseActors(state)
            .filter((other) => other !== this.actor && !other.isDead && sandboxTargeting.inferFaction(other) === myFaction && !sandboxTargeting.areHostile(this.actor, other));
    }
    getEngagedTargetsFrom(ally) {
        const targets = [];
        if (!ally.getTurrets && !ally.turrets) return targets;
        const turrets = ally.getTurrets ? ally.getTurrets() : ally.turrets;
        for (const turret of turrets) {
            if (turret.target && !turret.target.isDead) targets.push(turret.target);
            if (this.isTurretChargeCommitted(turret)) {
                const committed = this.getCommittedTurretTarget(turret);
                if (committed && !committed.isDead) targets.push(committed);
            }
        }
        return targets;
    }
    getMutualAssistTargets(state) {
        const targets = [];
        const seen = new Set();
        for (const ally of this.getAllyActors(state))
            for (const target of this.getEngagedTargetsFrom(ally)) {
                if (seen.has(target)) continue;
                seen.add(target);
                targets.push(target);
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
        if (!target || !state || !this.isMutualAssistTarget(state, target)) return 0;
        let bonus = 0;
        for (const ally of this.getAllyActors(state)) {
            if (!this.isTargetEngagedBy(ally, target)) continue;
            bonus = Math.max(bonus, Math.hypot(ally.x - this.actor.x, ally.y - this.actor.y));
        }
        return bonus;
    }
    getEffectiveTurretRange(state, target) {
        const baseRange = this.actor.weapon?.range ?? this.actor.combatRange ?? 200;
        if (!target) return baseRange;
        return baseRange + this.getMutualAssistRangeBonus(state, target);
    }
    isValidTurretTargetForSelf(target, state, { blocksTargeting = false } = {}) {
        if (!target || target.isDead) return false;
        const range = this.getEffectiveTurretRange(state, target);
        const distSq = Math.pow(target.x - this.actor.x, 2) + Math.pow(target.y - this.actor.y, 2);
        if (distSq > range * range) return false;
        if (this.blocksTurretLineOfSight(target, state)) return false;
        return true;
    }
    buildIndependentTargetExclusions(ownExcluded, state) {
        const excluded = new Set(ownExcluded ?? []);
        for (const target of this.getMutualAssistTargets(state)) excluded.add(target);
        return excluded;
    }
    findIndependentTurretTarget(state, ownExcluded) {
        const range = this.actor.weapon?.range ?? this.actor.combatRange ?? 200;
        return sandboxTargeting.getNearestHostile(state, this.actor, range, this.buildIndependentTargetExclusions(ownExcluded, state));
    }
    findTurretTarget(state, ownExcluded) {
        const range = this.actor.weapon?.range ?? this.actor.combatRange ?? 200;
        const ownExcludedSet = ownExcluded ?? new Set();
        const allyEngaged = this.getMutualAssistTargets(state);
        const independent = this.findIndependentTurretTarget(state, ownExcludedSet);
        if (independent) return independent;
        for (const target of allyEngaged) {
            if (ownExcludedSet.has(target)) continue;
            if (this.isValidTurretTargetForSelf(target, state)) return target;
        }
        const shared = sandboxTargeting.getNearestHostile(state, this.actor, range, ownExcludedSet);
        if (shared) return shared;
        for (const target of allyEngaged) {
            if (ownExcludedSet.has(target)) continue;
            if (this.isValidTurretTargetForSelf(target, state)) return target;
        }
        return sandboxTargeting.getNearestHostile(state, this.actor, range);
    }
    getExternalBlocksTargeting(state) {
        if (typeof this.actor.getExternalBlocksTargeting === "function") return this.actor.getExternalBlocksTargeting(state);
        return false;
    }
    getTurrets() {
        return this.actor.getTurrets ? this.actor.getTurrets() : this.actor.turrets || [];
    }
    getTurretAimPoint(turret, state, target, blocksTargeting) {
        if (this.actor.currentState?.getAimTarget) return this.actor.currentState.getAimTarget(this.actor, target, blocksTargeting, turret);
        if (target && !blocksTargeting) return target;
        return this.getMovementAimPoint(state);
    }
    getMovementAimPoint(_state) {
        if (this.actor.targetX != null && this.actor.targetY != null && this.actor.isMoving)
            return { x: this.actor.targetNodeX != null ? this.actor.targetNodeX : this.actor.targetX, y: this.actor.targetNodeY != null ? this.actor.targetNodeY : this.actor.targetY };
        const desiredX = this.actor.desiredX ?? 0;
        const desiredY = this.actor.desiredY ?? 0;
        const desiredLen = Math.hypot(desiredX, desiredY);
        if (desiredLen > 0.001) {
            const dist = 100;
            return { x: this.actor.x + (desiredX / desiredLen) * dist, y: this.actor.y + (desiredY / desiredLen) * dist };
        }
        const vx = this.actor.vx ?? 0;
        const vy = this.actor.vy ?? 0;
        const hasIntent = typeof this.actor.hasLocomotionIntent === "function" ? this.actor.hasLocomotionIntent() : Math.abs(vx) > 1 || Math.abs(vy) > 1;
        if (hasIntent) {
            const velLen = Math.hypot(vx, vy);
            if (velLen > 1) {
                const dist = 100;
                return { x: this.actor.x + (vx / velLen) * dist, y: this.actor.y + (vy / velLen) * dist };
            }
        }
        if (normalizeWeaponLoadout(this.actor.weaponLoadout ?? []).length > 0) {
            const dist = 100;
            const angle = this.actor.facing ?? this.actor.angle ?? 0;
            return { x: this.actor.x + Math.cos(angle) * dist, y: this.actor.y + Math.sin(angle) * dist };
        }
        return null;
    }
    aimIdleTurrets(dt, state, blocksTargeting = false) {
        const effectiveBlocks = this.resolveBlocksTargeting(state, blocksTargeting);
        if (this.actor.currentState?.locksTurretAim) {
            for (const turret of this.getTurrets()) {
                const aimTarget = this.getTurretAimPoint(turret, state, null, effectiveBlocks);
                if (!aimTarget) continue;
                turret.angle = normalizeAngle(Math.atan2(aimTarget.y - this.actor.y, aimTarget.x - this.actor.x));
            }
            return;
        }
        for (const turret of this.getTurrets()) {
            const aimTarget = this.resolveTurretAimPoint(turret, state, null, effectiveBlocks);
            if (!aimTarget) continue;
            WeaponSystem.aimTurret(turret, this.actor.x, this.actor.y, aimTarget.x, aimTarget.y, dt, 0);
        }
    }
    resolveTurretAimPoint(turret, state, target, blocksTargeting) {
        if (this.actor.currentState?.getAimTarget && this.actor.currentState.blocksTargeting) return this.getTurretAimPoint(turret, state, target, blocksTargeting);
        if (this.isTurretChargeCommitted(turret)) return this.getCommittedTurretTarget(turret);
        return this.getTurretAimPoint(turret, state, target, blocksTargeting);
    }
    resolveBlocksTargeting(state, externalBlocks = false) {
        if (externalBlocks) return true;
        if (this.actor.currentState?.blocksTargeting) return true;
        if (this.actor.currentState?.getTurretBlocksTargeting) return this.actor.currentState.getTurretBlocksTargeting(this.actor, state);
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
        if (this.isTurretChargeCommitted(turret)) return this.getCommittedTurretTarget(turret);
        return turret.target;
    }
    resolveTurretBlocksForProcessing(turret, state, externalBlocks = false) {
        if (this.isTurretChargeCommitted(turret)) return false;
        return this.resolveBlocksTargeting(state, externalBlocks);
    }
    canIncrementTurretCharge(turret, isAimed) {
        if (this.isTurretChargeCommitted(turret)) return true;
        return isAimed;
    }
    syncTurretChargeTarget(turret, target) {
        if (this.isTurretChargeCommitted(turret)) return;
        if (turret.lastTarget !== target) {
            this.clearTurretCharge(turret);
            turret.lastTarget = target;
        }
    }
    acquireTurretTargets(state, blocksTargeting = false) {
        if (this.actor.isManualShootActive) {
            for (const turret of this.getTurrets()) turret.target = null;
            return;
        }
        const actualBlocks = this.resolveBlocksTargeting(state, blocksTargeting);
        const engagedTargets = new Set();
        for (const turret of this.getTurrets()) {
            const committed = this.isTurretChargeCommitted(turret);
            if (committed) {
                const chargeTarget = this.getCommittedTurretTarget(turret);
                if (!chargeTarget) {
                    this.clearTurretCharge(turret);
                    turret.target = null;
                } else turret.target = chargeTarget;
            }
            if (turret.target && !committed) {
                const stillValid = this.isValidTurretTargetForSelf(turret.target, state, { blocksTargeting: actualBlocks });
                if (!stillValid) {
                    turret.target = null;
                    this.clearTurretCharge(turret);
                } else {
                    const independent = this.findIndependentTurretTarget(state, engagedTargets);
                    if (independent && independent !== turret.target) turret.target = independent;
                    else if (engagedTargets.has(turret.target)) {
                        const betterTarget = this.findTurretTarget(state, engagedTargets);
                        if (betterTarget) turret.target = betterTarget;
                    }
                }
            }
            if (!turret.target && !actualBlocks && !this.isTurretChargeCommitted(turret)) turret.target = this.findTurretTarget(state, engagedTargets);
            if (turret.target) engagedTargets.add(turret.target);
        }
    }
    processAllTurrets(dt, state, blocksTargeting = false, combatEvents = []) {
        const isManualShoot = this.actor.isManualShootActive;
        for (const turret of this.getTurrets()) {
            const gun = turret.gun ?? getGunDefinition(turret.gunId);
            let activeSight = null;
            if (gun.attachments)
                for (const attachment of Object.values(gun.attachments))
                    if (attachment.enabled && attachment.isSight) {
                        activeSight = attachment;
                        break;
                    }
            if (activeSight && state && state.activeLasers) {
                const target = this.resolveTurretTargetForProcessing(turret);
                const { x: tx, y: ty } = turret.getMuzzlePosition(this.actor, gun.bulletRadius ?? 2, target);
                const range = this.actor.weapon?.range ?? this.actor.combatRange ?? 200;
                const hit = WeaponSystem.castLaser(tx, ty, turret.angle, range, state, 1, this.actor);
                const color = hit.hit === "actor" && sandboxTargeting.areHostile(this.actor, hit.entity) ? "#ff0000" : "#00ff00";
                state.activeLasers.push(new Laser(tx, ty, hit.x, hit.y, color, true));
            }
            if (isManualShoot) {
                advanceTurretAmmo(dt, turret, gun, this.actor);
                continue;
            }
            const mode = resolveWeaponModeForGun(gun);
            const target = this.resolveTurretTargetForProcessing(turret);
            const turretBlocks = this.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);
            mode.processTurret(dt, state, this.actor, gun, turret, target, turretBlocks, combatEvents);
        }
        return combatEvents;
    }
    manualFire(state, targetX, targetY) {
        let firedAny = false;
        for (const turret of this.getTurrets()) {
            const gun = turret.gun ?? getGunDefinition(turret.gunId);
            const fireIntervalMs = getSlotFireIntervalMs(gun, this.actor);
            if (turret.manualFireCooldown === undefined) turret.manualFireCooldown = 0;
            if (turret.reloading || turret.manualFireCooldown > 0) continue;
            const angle = Math.atan2(targetY - this.actor.y, targetX - this.actor.x);
            turret.angle = angle;
            if (gun.kind === "projectile") {
                if (typeof turret.fire === "function") {
                    turret.fire(state, this.actor);
                    firedAny = true;
                }
            } else if (gun.kind === "beam") {
                const { x: tx, y: ty } = turret.getMuzzlePosition(this.actor, gun.bulletRadius ?? 2);
                const range = this.actor.weapon?.range ?? this.actor.combatRange ?? 200;
                const hit = WeaponSystem.castLaser(tx, ty, turret.angle, range, state, gun.beamRadius, this.actor);
                if (state.activeLasers) state.activeLasers.push(new Laser(tx, ty, hit.x, hit.y));
                const tickDamage = getBeamTickDamage(gun);
                if (hit.hit === "actor" && sandboxTargeting.areHostile(this.actor, hit.entity)) hit.entity.handleHit?.(tickDamage, { state }, "beam");
                else if (hit.hit === "prop" && hit.entity.strategy?.onHit) hit.entity.strategy.onHit(state, hit.entity, createBeamHitSource(gun), []);
                firedAny = true;
            }
            if (firedAny) {
                turret.manualFireCooldown = fireIntervalMs;
                if (turret.ammo !== undefined && turret.ammo > 0) {
                    turret.ammo--;
                    if (turret.ammo <= 0) {
                        turret.reloading = true;
                        turret.reloadTimer = 0;
                    }
                }
            }
        }
        return firedAny;
    }
}
