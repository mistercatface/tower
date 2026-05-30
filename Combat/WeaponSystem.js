import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { Utilities } from "../Core/Utilities.js";
import { Laser } from "../Entities/Laser.js";
import { defaultGunId, getGunDefinition } from "../Config/gunDefinitions.js";
import { getSlotFireIntervalMs } from "./gunCombat.js";
import { getBeamTickDamage, createBeamHitSource } from "./impactDamage.js";
import { areHostile, getHostiles, getNearestHostile } from "./Targeting.js";

export class ChargedWeaponMode {
    constructor(onFireFn) {
        this.onFire = onFireFn;
    }

    processTurret(dt, state, source, gun, turret, target, blocksTargeting, combatEvents) {
        if (turret.currentGunId !== turret.gunId || turret.ammo === undefined) {
            turret.currentGunId = turret.gunId;
            turret.ammo = gun.maxAmmo;
            turret.reloading = false;
            turret.reloadTimer = 0;
        }

        if (turret.reloading) {
            turret.reloadTimer += dt;
            if (turret.reloadTimer >= gun.reloadTimeMs) {
                turret.reloading = false;
                turret.reloadTimer = 0;
                turret.ammo = gun.maxAmmo;
            }
        }

        if (!turret.reloading && turret.ammo <= 0) {
            turret.reloading = true;
            turret.reloadTimer = 0;
        }

        if (turret.reloading) {
            source.clearTurretCharge(turret);
            return;
        }

        const committed = source.isTurretChargeCommitted(turret);
        const fireTarget = source.resolveTurretTargetForProcessing(turret);
        const effectiveBlocks = source.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);

        const aimTarget = source.resolveTurretAimPoint(turret, state, fireTarget, effectiveBlocks);

        if (!aimTarget) {
            if (!committed) {
                source.clearTurretCharge(turret);
            }
            return;
        }

        const fireIntervalMs = getSlotFireIntervalMs(gun, source);
        const sway = WeaponSystem.computeAccuracySway(source, turret, dt, true);

        const isAimed = WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);

        if (fireTarget && !effectiveBlocks) {
            source.syncTurretChargeTarget(turret, fireTarget);

            if (source.canIncrementTurretCharge(turret, isAimed)) {
                turret.charge += dt;
                if (turret.charge >= fireIntervalMs) {
                    if (turret.ammo > 0) {
                        this.onFire(state, turret, source);
                        turret.ammo--;
                        source.clearTurretCharge(turret);
                        if (turret.ammo <= 0) {
                            turret.reloading = true;
                            turret.reloadTimer = 0;
                        }
                    }
                }
            }
        } else if (!committed) {
            source.clearTurretCharge(turret);
        }
    }
}

export class ContinuousWeaponMode {
    constructor(onTickFn) {
        this.onTick = onTickFn;
    }

    processTurret(dt, state, source, gun, turret, target, blocksTargeting, combatEvents) {
        if (turret.currentGunId !== turret.gunId || turret.ammo === undefined) {
            turret.currentGunId = turret.gunId;
            turret.ammo = gun.maxAmmo;
            turret.reloading = false;
            turret.reloadTimer = 0;
        }

        if (turret.reloading) {
            turret.reloadTimer += dt;
            if (turret.reloadTimer >= gun.reloadTimeMs) {
                turret.reloading = false;
                turret.reloadTimer = 0;
                turret.ammo = gun.maxAmmo;
            }
        }

        if (!turret.reloading && turret.ammo <= 0) {
            turret.reloading = true;
            turret.reloadTimer = 0;
        }

        const turretDist = source.radius + 4 + 4 * (source.radius / 8);
        const tx = source.x + Math.cos(turret.angle) * turretDist;
        const ty = source.y + Math.sin(turret.angle) * turretDist;
        const effectiveBlocks = source.resolveTurretBlocksForProcessing(turret, state, blocksTargeting);
        const aimTarget = source.resolveTurretAimPoint(turret, state, target, effectiveBlocks);

        const sway = WeaponSystem.computeAccuracySway(source, turret, dt);

        if (aimTarget) {
            WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);
        }
        turret.lastTarget = (target && !effectiveBlocks) ? target : null;
        this.onTick(dt, state, tx, ty, turret, combatEvents, source);
    }
}

const DEFAULT_TURRET_WEAPON_MODE = new ChargedWeaponMode((state, turret, source) => {
    turret.fire(state, source);
});

export function createLaserWeaponMode() {
    return new ContinuousWeaponMode((dt, state, tx, ty, turret, combatEvents, source) => {
        const gun = getGunDefinition(turret.gunId ?? defaultGunId);
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
            if (hit.hit === "actor" && areHostile(source, hit.entity)) {
                combatEvents.push({ target: hit.entity, damage: tickDamage });
            } else if (hit.hit === "pickup" && hit.entity.strategy?.onHit) {
                const skipExplosive = state.abilities["TargetVerification"] && hit.entity.strategy.isExplosive;
                if (!skipExplosive) {
                    hit.entity.strategy.onHit(state, hit.entity, createBeamHitSource(gun), combatEvents);
                }
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
        const step = 8;
        let dist = 0;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let cx = startX;
        let cy = startY;
        const rayCircle = { x: cx, y: cy, radius: beamRadius };

        const endX = startX + dx * maxDist;
        const endY = startY + dy * maxDist;

        let candidateWalls = state.walls;
        if (state.obstacleGrid) {
            candidateWalls = Utilities.getSegmentsAlongLine(startX, startY, endX, endY, state.obstacleGrid);
        } else {
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);
            const temp = [];
            for (const seg of state.walls) {
                if (seg.isDead) continue;
                const limit = seg.size * 0.75 + 1.5;
                if (seg.x < minX - limit || seg.x > maxX + limit ||
                    seg.y < minY - limit || seg.y > maxY + limit) {
                    continue;
                }
                temp.push(seg);
            }
            candidateWalls = temp;
        }

        while (dist < maxDist) {
            cx += dx * step;
            cy += dy * step;
            dist += step;
            rayCircle.x = cx;
            rayCircle.y = cy;

            let hitWall = false;
            for (const seg of candidateWalls) {
                if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                    hitWall = true;
                    break;
                }
            }

            if (hitWall) {
                while (hitWall && dist > 0) {
                    cx -= dx;
                    cy -= dy;
                    dist -= 1;
                    rayCircle.x = cx;
                    rayCircle.y = cy;
                    hitWall = false;
                    for (const seg of candidateWalls) {
                        if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                            hitWall = true;
                            break;
                        }
                    }
                }
                return { hit: "wall", x: cx, y: cy, dist: dist };
            }

            for (const p of state.pickups) {
                if (p.isDead || !p.strategy?.laserTargetable) continue;
                if (CollisionSystem.checkCircle(rayCircle, p)) {
                    const distToPickup = Math.hypot(p.x - startX, p.y - startY);
                    const exactDist = distToPickup - p.radius;
                    const finalX = startX + dx * exactDist;
                    const finalY = startY + dy * exactDist;
                    return { hit: "pickup", entity: p, x: finalX, y: finalY, dist: exactDist };
                }
            }

            const hostiles = source ? getHostiles(state, source) : state.enemies;
            for (const e of hostiles) {
                if (e.isDead) continue;
                if (CollisionSystem.checkCircle(rayCircle, e)) {
                    const distToTarget = Math.hypot(e.x - startX, e.y - startY);
                    const exactDist = distToTarget - e.radius;
                    const finalX = startX + dx * exactDist;
                    const finalY = startY + dy * exactDist;
                    return { hit: "actor", entity: e, x: finalX, y: finalY, dist: exactDist };
                }
            }
        }
        return { hit: "none", x: cx, y: cy, dist: dist };
    }

    static computeAccuracySway(source, turret, dt, requireCharge = false) {
        const weapon = source.weapon;
        if (!weapon || weapon.accuracy === undefined) return 0;
        if (requireCharge && turret.charge <= 0) return 0;

        const effectiveAccuracy = source.applyMovementAccuracyPenalty(weapon.accuracy);
        const accuracySpread = ((1 - effectiveAccuracy) * Math.PI) / 2 * 0.5;
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
        diff = Utilities.normalizeAngle(diff);

        if (Math.abs(diff) < 0.05) {
            turret.angle = targetAngle;
            return true;
        } else {
            turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
            turret.angle = Utilities.normalizeAngle(turret.angle);
            return false;
        }
    }
}