import { resolveCombatFacing, resolveSpriteBodyRotation } from "./facing.js";
import { resolveWeaponDrawSlots, resolveWeaponStaticPoseName } from "./weaponVisuals.js";
import { resolveMuzzleFromRig } from "./muzzle.js";

/** Tower game rules injected into the engine kinematics bundle. */
export const towerKinematicsPorts = {
    resolveCombatFacing,
    resolveSpriteBodyRotation,
    resolveWeaponStaticPoseName,
    resolveWeaponDrawSlots,
    resolveMuzzleFromRig,
};
