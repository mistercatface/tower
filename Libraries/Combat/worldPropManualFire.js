import { syncWorldPropWeaponState } from "./worldPropWeaponState.js";
import { TurretController } from "./TurretController.js";
/** Handle manual fire for world props using Turret AI controllers. */
export function manualFireWorldProp(state, prop, targetX, targetY, dt, isShooting) {
    syncWorldPropWeaponState(prop);
    if (!prop.turretController) prop.turretController = new TurretController(prop);
    prop.isManualShootActive = isShooting;
    prop.turretController.updateTurretCombat(dt, state, { combatEvents: [] });
    if (prop.turrets && prop.turrets[0]?.angle != null) prop.facing = prop.turrets[0].angle;
    if (isShooting) return prop.turretController.manualFire(state, targetX, targetY);
    return false;
}
