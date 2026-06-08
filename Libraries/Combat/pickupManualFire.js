import { syncPickupWeaponState } from "./pickupWeaponState.js";
import { TurretController } from "./TurretController.js";
/** Handle manual fire for pickups using Turret AI controllers. */
export function manualFirePickup(state, pickup, targetX, targetY, dt, isShooting) {
    syncPickupWeaponState(pickup);
    if (!pickup.turretController) pickup.turretController = new TurretController(pickup);
    pickup.isManualShootActive = isShooting;
    pickup.turretController.updateTurretCombat(dt, state, { combatEvents: [] });
    if (pickup.turrets && pickup.turrets[0]?.angle != null) pickup.facing = pickup.turrets[0].angle;
    if (isShooting) return pickup.turretController.manualFire(state, targetX, targetY);
    return false;
}
