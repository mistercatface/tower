import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { TurretController } from "./TurretController.js";
import { syncPickupWeaponState } from "./pickupWeaponState.js";
import { isSandboxEquippable } from "../Sandbox/sandboxCapabilities.js";
import { getPropAsset } from "../Props/PropCatalog.js";
export function isPickupCombatReady(pickup) {
    if (!pickup || pickup.isDead) return false;
    if (!isSandboxEquippable(getPropAsset(pickup.type))) return false;
    return normalizeWeaponLoadout(pickup.weaponLoadout ?? []).length > 0;
}
/** Auto-aim and fire when a hostile target is in weapon range with line of sight. */
export function autoFirePickup(state, pickup, dt) {
    if (!isPickupCombatReady(pickup)) return false;
    syncPickupWeaponState(pickup);
    if (!pickup.turretController) pickup.turretController = new TurretController(pickup);
    pickup.isManualShootActive = false;
    pickup.turretController.updateTurretCombat(dt, state, { combatEvents: [] });
    if (pickup.turrets && pickup.turrets[0]?.angle != null) pickup.facing = pickup.turrets[0].angle;
    return true;
}
/** @param {object} state */
export function updateSandboxAutoCombat(state, dt) {
    state.entityRegistry.forEachOfKind("pickup", (pickup) => autoFirePickup(state, pickup, dt));
}
