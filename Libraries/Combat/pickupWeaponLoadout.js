import { clearActorKinematics } from "../Render/Characters/actorKinematicsRenderer.js";
import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { syncPickupWeaponState } from "./pickupWeaponState.js";
/** Apply a weapon loadout to a kinematics pickup and refresh its sprite cache. */
export function applyPickupWeaponLoadout(pickup, gunIds) {
    pickup.weaponLoadout = normalizeWeaponLoadout(gunIds);
    syncPickupWeaponState(pickup);
    if (pickup.usesKinematicsBody) clearActorKinematics(pickup);
}
