import { getNearestHostile } from "../../Core/GamePorts.js";
import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { manualFirePickup } from "./pickupManualFire.js";
import { DEFAULT_SIGHT_RANGE } from "./pickupWeaponState.js";

export function resolvePickupCombatRange(pickup) {
    return pickup.weapon?.range ?? pickup.combatRange ?? DEFAULT_SIGHT_RANGE;
}

export function isPickupCombatReady(pickup) {
    if (!pickup || pickup.isDead) return false;
    return normalizeWeaponLoadout(pickup.weaponLoadout ?? []).length > 0;
}

/** Auto-aim and fire when a hostile target is in weapon range with line of sight. */
export function autoFirePickup(state, pickup, dt) {
    if (!isPickupCombatReady(pickup)) return false;
    const target = getNearestHostile(state, pickup, resolvePickupCombatRange(pickup), null, { requireLos: true });
    if (!target) return false;
    return manualFirePickup(state, pickup, target.x, target.y, dt, true);
}

/** @param {object} state */
export function updateSandboxAutoCombat(state, dt) {
    if (!state.pickups?.length) return;
    for (const pickup of state.pickups) autoFirePickup(state, pickup, dt);
}
