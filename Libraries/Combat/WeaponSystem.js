import { normalizeAngle } from "../Math/Angle.js";
import { buildLaserTargetCircles, castLaserRay } from "./laserCast.js";
import { Laser } from "./Laser.js";
import { defaultGunId, getGunDefinition } from "./gunDefaults.js";
import { getSlotFireIntervalMs } from "./gunCombat.js";
import { getBeamTickDamage, createBeamHitSource } from "./impactDamage.js";
import { areHostile, getBroadphaseActors, getHostiles } from "../../Core/GamePorts.js";
import { advanceTurretAmmo } from "./turretAmmo.js";
export { advanceTurretAmmo };
export class ChargedWeaponMode {
    constructor(onFireFn) {
        this.onFire = onFireFn;
    }
    processTurret(dt, state, source, gun, turret, target, blocksTargeting, combatEvents) {
        const reloading = advanceTurretAmmo(dt, turret, gun, source);
        if (reloading) source.turretController.clearTurretCharge(turret);
        const committed = source.turretController.isTurretChargeCommitted(turret);
        const fireTarget = source.turretController.resolveTurretTargetForProcessing(turret);
        const effectiveBlocks = source.turretController.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);
        const aimTarget = source.turretController.resolveTurretAimPoint(turret, state, fireTarget, effectiveBlocks);
        if (!aimTarget) {
            if (!committed) source.turretController.clearTurretCharge(turret);
            return;
        }
        const fireIntervalMs = getSlotFireIntervalMs(gun, source);
        const sway = WeaponSystem.computeAccuracySway(source, turret, dt, true);
        const isAimed = WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);
        if (!turret.reloading && fireTarget && !effectiveBlocks) {
            source.turretController.syncTurretChargeTarget(turret, fireTarget);
            if (source.turretController.canIncrementTurretCharge(turret, isAimed)) {
                turret.charge += dt;
                if (turret.charge >= fireIntervalMs)
                    if (turret.ammo > 0) {
                        this.onFire(state, turret, source);
                        turret.ammo--;
                        source.turretController.clearTurretCharge(turret);
                        if (turret.ammo <= 0) {
                            turret.reloading = true;
                            turret.reloadTimer = 0;
                        }
                    }
            }
        } else if (!committed) source.turretController.clearTurretCharge(turret);
    }
}
export class ContinuousWeaponMode {
    constructor(onTickFn) {
        this.onTick = onTickFn;
    }
    processTurret(dt, state, source, gun, turret, target, blocksTargeting, combatEvents) {
        advanceTurretAmmo(dt, turret, gun, source);
        const fireTarget = source.turretController.resolveTurretTargetForProcessing(turret);
        const { x: tx, y: ty } = turret.getMuzzlePosition(source, gun.beamRadius ?? 1, fireTarget);
        const effectiveBlocks = source.turretController.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);
        const aimTarget = source.turretController.resolveTurretAimPoint(turret, state, target, effectiveBlocks);
        const sway = WeaponSystem.computeAccuracySway(source, turret, dt);
        if (aimTarget) WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);
        turret.lastTarget = target && !effectiveBlocks ? target : null;
        this.onTick(dt, state, tx, ty, turret, combatEvents, source);
    }
}
const DEFAULT_TURRET_WEAPON_MODE = new ChargedWeaponMode((state, turret, source) => {
    turret.fire(state, source);
});
export function createLaserWeaponMode() {
    return new ContinuousWeaponMode((dt, state, tx, ty, turret, combatEvents, source) => {
        const gun = turret.gun ?? getGunDefinition(turret.gunId ?? defaultGunId);
        if (gun.kind !== "beam") return;
        if (turret.reloading) {
            turret.currentLaserLength = 0;
            turret.laserTimer = 0;
            return;
        }
        turret.laserTimer = (turret.laserTimer || 0) + dt;
        let laserCanDamage = false;
        if (turret.laserTimer >= gun.tickIntervalMs) {
            laserCanDamage = true;
            turret.laserTimer = 0;
        }
        turret.currentLaserLength = (turret.currentLaserLength || 0) + gun.beamGrowthSpeed * (dt / 1000);
        turret.currentLaserLength = Math.min(source.weapon?.range ?? 200, turret.currentLaserLength);
        const hit = WeaponSystem.castLaser(tx, ty, turret.angle, turret.currentLaserLength, state, gun.beamRadius, source);
        turret.currentLaserLength = hit.dist;
        state.activeLasers.push(new Laser(tx, ty, hit.x, hit.y));
        if (laserCanDamage) {
            if (turret.ammo > 0) {
                turret.ammo--;
                if (turret.ammo <= 0) {
                    turret.reloading = true;
                    turret.reloadTimer = 0;
                }
            }
            const tickDamage = getBeamTickDamage(gun);
            if (hit.hit === "actor" && areHostile(source, hit.entity)) combatEvents.push({ target: hit.entity, damage: tickDamage, type: "beam" });
            else if (hit.hit === "pickup" && hit.entity.strategy?.onHit) hit.entity.strategy.onHit(state, hit.entity, createBeamHitSource(gun), combatEvents);
        }
    });
}
export function resolveWeaponModeForGun(gun) {
    if (gun?.kind === "beam") return LASER_WEAPON_MODE;
    return DEFAULT_TURRET_WEAPON_MODE;
}
export const LASER_WEAPON_MODE = createLaserWeaponMode();
export class WeaponSystem {
    static castLaser(startX, startY, angle, maxDist, state, beamRadius = 1, source = null) {
        const actorTargets = source ? getHostiles(state, source) : getBroadphaseActors(state);
        const circles = buildLaserTargetCircles(state, { source, includePickups: true, includeActors: actorTargets });
        return castLaserRay(startX, startY, angle, maxDist, state, beamRadius, circles);
    }
    static computeAccuracySway(source, turret, dt, requireCharge = false) {
        const weapon = source.weapon;
        if (!weapon || weapon.accuracy === undefined) return 0;
        if (requireCharge && turret.charge <= 0) return 0;
        const effectiveAccuracy = typeof source.applyMovementAccuracyPenalty === "function" ? source.applyMovementAccuracyPenalty(weapon.accuracy) : weapon.accuracy;
        const accuracySpread = (((1 - effectiveAccuracy) * Math.PI) / 2) * 0.5;
        const frequency = 0.005;
        turret.swayPhase = (turret.swayPhase || 0) + dt * frequency;
        const turretsList = source.getTurrets ? source.getTurrets() : source.turrets || [];
        const phaseOffset = turretsList.indexOf(turret) * 2.0;
        return Math.sin(turret.swayPhase + phaseOffset) * accuracySpread;
    }
    static aimTurret(turret, currentX, currentY, targetX, targetY, dt, sway = 0) {
        if (targetX === null || targetY === null) return false;
        let targetAngle = Math.atan2(targetY - currentY, targetX - currentX);
        targetAngle += sway;
        let diff = targetAngle - turret.angle;
        diff = normalizeAngle(diff);
        const turnSpeed = turret.turnSpeed ?? 10;
        if (Math.abs(diff) < 0.05) {
            turret.angle = targetAngle;
            return true;
        } else {
            turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * (dt / 1000));
            turret.angle = normalizeAngle(turret.angle);
            return false;
        }
    }
}
