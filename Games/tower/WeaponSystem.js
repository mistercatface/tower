import { normalizeAngle } from "../../Libraries/Math/Angle.js";
import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
import { castSteppedCircleRay } from "../../Libraries/Spatial/query/steppedCircleRayCast.js";
import { Laser } from "./entities/Laser.js";
import { defaultGunId, getGunDefinition } from "../../Config/content/guns.js";
import { getSlotFireIntervalMs, getSlotReloadTimeMs } from "./combat/gunCombat.js";
import { getBeamTickDamage, createBeamHitSource } from "./combat/impactDamage.js";
import { areHostile, getBroadphaseActors, getHostiles } from "./targeting.js";
export function advanceTurretAmmo(dt, turret, gun, source) {
    if (turret.currentGunId !== turret.gunId || turret.ammo === undefined) {
        turret.currentGunId = turret.gunId;
        turret.ammo = gun.maxAmmo;
        turret.reloading = false;
        turret.reloadTimer = 0;
    }
    if (turret.reloading) {
        turret.reloadTimer += dt;
        const reloadTimeMs = getSlotReloadTimeMs(gun, source);
        if (turret.reloadTimer >= reloadTimeMs) {
            turret.reloading = false;
            turret.reloadTimer = 0;
            turret.ammo = gun.maxAmmo;
        }
    }
    if (!turret.reloading && turret.ammo <= 0) {
        turret.reloading = true;
        turret.reloadTimer = 0;
    }
    return turret.reloading;
}
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
        turret.currentLaserLength = Math.min(source.weapon.range, turret.currentLaserLength);
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
            if (hit.hit === "actor" && areHostile(source, hit.entity)) combatEvents.push({ target: hit.entity, damage: tickDamage });
            else if (hit.hit === "pickup" && hit.entity.strategy?.onHit) {
                const skipExplosive = state.abilities["TargetVerification"] && hit.entity.strategy.isExplosive;
                if (!skipExplosive) hit.entity.strategy.onHit(state, hit.entity, createBeamHitSource(gun), combatEvents);
            }
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
        /** @type {import("../../Libraries/Spatial/query/steppedCircleRayCast.js").SteppedCircleRayCircleTarget[]} */
        const circles = [];
        for (const p of state.pickups) {
            if (p.isDead || !p.strategy?.laserTargetable) continue;
            circles.push({ entity: p, radius: p.radius, hitKind: "pickup" });
        }
        const actorTargets = source ? getHostiles(state, source) : getBroadphaseActors(state);
        for (const e of actorTargets) {
            if (e.isDead) continue;
            circles.push({ entity: e, radius: e.radius, hitKind: "actor" });
        }
        return castSteppedCircleRay(startX, startY, angle, maxDist, beamRadius, { wallCtx: wallContextFromState(state), circles });
    }
    static computeAccuracySway(source, turret, dt, requireCharge = false) {
        const weapon = source.weapon;
        if (!weapon || weapon.accuracy === undefined) return 0;
        if (requireCharge && turret.charge <= 0) return 0;
        const effectiveAccuracy = source.applyMovementAccuracyPenalty(weapon.accuracy);
        const accuracySpread = (((1 - effectiveAccuracy) * Math.PI) / 2) * 0.5;
        const frequency = 0.005;
        turret.swayPhase += dt * frequency;
        const turretsList = source.getTurrets();
        const phaseOffset = turretsList.indexOf(turret) * 2.0;
        return Math.sin(turret.swayPhase + phaseOffset) * accuracySpread;
    }
    static aimTurret(turret, currentX, currentY, targetX, targetY, dt, sway = 0) {
        if (targetX === null || targetY === null) return false;
        let targetAngle = Math.atan2(targetY - currentY, targetX - currentX);
        targetAngle += sway;
        let diff = targetAngle - turret.angle;
        diff = normalizeAngle(diff);
        if (Math.abs(diff) < 0.05) {
            turret.angle = targetAngle;
            return true;
        } else {
            turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
            turret.angle = normalizeAngle(turret.angle);
            return false;
        }
    }
}
