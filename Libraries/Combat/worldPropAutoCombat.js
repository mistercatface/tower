import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { TurretController } from "./TurretController.js";
import { syncWorldPropWeaponState } from "./worldPropWeaponState.js";
import { isSandboxEquippable } from "../Sandbox/sandboxCapabilities.js";
import { getPropAsset } from "../Props/PropCatalog.js";
export function isWorldPropCombatReady(prop) {
    if (!prop || prop.isDead) return false;
    if (!isSandboxEquippable(getPropAsset(prop.type))) return false;
    return normalizeWeaponLoadout(prop.weaponLoadout ?? []).length > 0;
}
/** Auto-aim and fire when a hostile target is in weapon range with line of sight. */
export function autoFireWorldProp(state, prop, dt) {
    if (!isWorldPropCombatReady(prop)) return false;
    syncWorldPropWeaponState(prop);
    if (!prop.turretController) prop.turretController = new TurretController(prop);
    prop.isManualShootActive = false;
    prop.turretController.updateTurretCombat(dt, state, { combatEvents: [] });
    if (prop.turrets && prop.turrets[0]?.angle != null) prop.facing = prop.turrets[0].angle;
    return true;
}
/** @param {object} state */
export function updateSandboxAutoCombat(state, dt) {
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead) return;
        autoFireWorldProp(state, prop, dt);
    });
}
