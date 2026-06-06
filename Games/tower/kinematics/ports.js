import { getCharacterForActor } from "./appearance.js";
import { resolveCombatFacing, resolveSpriteBodyRotation } from "./facing.js";
import { drawHeldWeapons, resolveWeaponDrawSlots, resolveWeaponStaticPoseName } from "./weaponVisuals.js";
import { resolveMuzzleFromRig } from "./muzzle.js";

/** Tower game rules injected into the engine kinematics bundle. */
export const towerKinematicsPorts = {
    resolveCombatFacing,
    resolveSpriteBodyRotation,
    resolveWeaponStaticPoseName,
    resolveWeaponDrawSlots,
    resolveMuzzleFromRig,
    getCharacterForActor,
    drawHeldWeapons,
};
