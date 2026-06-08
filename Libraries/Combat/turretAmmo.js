import { getSlotReloadTimeMs } from "./gunCombat.js";
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
