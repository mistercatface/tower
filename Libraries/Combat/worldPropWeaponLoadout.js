import { clearActorKinematics } from "../Render/Characters/actorKinematicsRenderer.js";
import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { syncWorldPropWeaponState } from "./worldPropWeaponState.js";
/** Apply a weapon loadout to a kinematics prop and refresh its sprite cache. */
export function applyWorldPropWeaponLoadout(prop, gunIds) {
    prop.weaponLoadout = normalizeWeaponLoadout(gunIds);
    syncWorldPropWeaponState(prop);
    if (prop.usesKinematicsBody) clearActorKinematics(prop);
}
