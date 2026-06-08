import { syncPickupWeaponState } from "./pickupWeaponState.js";
import { spawnProjectilesFromGun } from "./spawnProjectiles.js";
import { resolveFireAngleOffsets } from "./turretLoadout.js";
import { resolveKinematicsMuzzlePosition } from "../Render/Characters/actorKinematicsRenderer.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { inferFaction } from "../../Core/GamePorts.js";
import { getSlotFireIntervalMs, getSlotReloadTimeMs } from "./gunCombat.js";
import { normalizeAngle } from "../Math/Angle.js";
function resolvePickupTurretTurnSpeed(pickup) {
    return pickup.stats?.turnSpeed?.value ?? pickup.turnSpeed ?? 10;
}
function aimPickupTurret(turret, sourceX, sourceY, targetX, targetY, dt) {
    const targetAngle = Math.atan2(targetY - sourceY, targetX - sourceX);
    let diff = targetAngle - turret.angle;
    diff = normalizeAngle(diff);
    const turnSpeed = turret.turnSpeed ?? 10;
    if (Math.abs(diff) < 0.05) {
        turret.angle = targetAngle;
        return true;
    }
    turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * (dt / 1000));
    turret.angle = normalizeAngle(turret.angle);
    return false;
}
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
function firePickupProjectileTurret(state, pickup, turret, turretIndex, gun) {
    const loadout = gun.turretLoadout;
    const radiusMultiplier = loadout?.radiusMultiplier ?? 1;
    const camera = { x: pickup.x, y: pickup.y };
    const muzzle = resolveKinematicsMuzzlePosition(pickup, turretIndex, camera);
    if (!muzzle) return false;
    const angleOffsets = resolveFireAngleOffsets(loadout);
    const faction = inferFaction(pickup) ?? "player";
    spawnProjectilesFromGun(state, pickup, { tx: muzzle.x, ty: muzzle.y, baseAngle: turret.angle, gun, radiusMultiplier, angleOffsets, faction, penetration: pickup.weapon?.penetration ?? 0 });
    CombatParticles.spawnMuzzleFlash(state, muzzle.x, muzzle.y, turret.angle, { isPellet: loadout?.pelletCount != null });
    return true;
}
/** Handle manual fire for pickups without full Turret AI controllers. */
export function manualFirePickup(state, pickup, targetX, targetY, dt, isShooting) {
    syncPickupWeaponState(pickup);
    let firedAny = false;
    const turnSpeed = resolvePickupTurretTurnSpeed(pickup);
    for (let i = 0; i < pickup.turrets.length; i++) {
        const turret = pickup.turrets[i];
        if (!turret?.gun) continue;
        const gun = turret.gun;
        if (turret.turnSpeed == null) turret.turnSpeed = turnSpeed;
        const reloading = advanceTurretAmmo(dt, turret, gun, pickup);
        if (reloading) {
            turret.charge = 0;
            continue;
        }
        if (!isShooting) {
            turret.charge = 0;
            continue;
        }
        const isAimed = aimPickupTurret(turret, pickup.x, pickup.y, targetX, targetY, dt);
        if (!isAimed) {
            turret.charge = 0;
            continue;
        }
        const fireIntervalMs = getSlotFireIntervalMs(gun, pickup);
        turret.charge = (turret.charge ?? 0) + dt;
        if (turret.charge < fireIntervalMs || turret.ammo <= 0) continue;
        if (gun.kind !== "projectile") {
            turret.charge = 0;
            continue;
        }
        if (firePickupProjectileTurret(state, pickup, turret, i, gun)) {
            firedAny = true;
            turret.ammo--;
            turret.charge = 0;
            if (turret.ammo <= 0) {
                turret.reloading = true;
                turret.reloadTimer = 0;
            }
        }
    }
    if (isShooting && pickup.turrets[0]?.angle != null) pickup.facing = pickup.turrets[0].angle;
    return firedAny;
}
