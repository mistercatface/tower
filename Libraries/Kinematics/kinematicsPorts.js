import { resolveCombatFacing, resolveSpriteBodyRotation } from "./anim/combatFacing.js";
import { createCharacterResolver } from "../Render/Characters/appearance.js";
import { createWeaponVisuals } from "../Render/Characters/weapons/createWeaponVisuals.js";
import { createMuzzleResolver } from "../Render/Characters/weapons/muzzle.js";
/**
 * Default kinematics port bundle for humanoid actors.
 *
 * @param {{
 *   appearanceOverrides?: object,
 *   gunIdToVisual: Record<string, string>,
 * }} options
 */
export function createDefaultKinematicsPorts({ appearanceOverrides, gunIdToVisual }) {
    const weaponVisuals = createWeaponVisuals(gunIdToVisual);
    const getCharacterForActor = createCharacterResolver(appearanceOverrides);
    return {
        resolveCombatFacing,
        resolveSpriteBodyRotation,
        resolveWeaponStaticPoseName: weaponVisuals.resolveWeaponStaticPoseName,
        resolveWeaponDrawSlots: weaponVisuals.resolveWeaponDrawSlots,
        resolveMuzzleFromRig: createMuzzleResolver(weaponVisuals),
        getCharacterForActor,
        drawHeldWeapons: weaponVisuals.drawHeldWeapons,
    };
}
