import { resolveCombatFacing, resolveSpriteBodyRotation } from "./anim/combatFacing.js";
import { createCharacterResolver } from "../Render/Characters/appearance.js";
import { createMuzzleResolver } from "../Render/Characters/weapons/muzzle.js";
import { createEmptyWeaponVisuals } from "../Render/Characters/weapons/weaponVisualsPort.js";
/**
 * Default kinematics port bundle for humanoid actors.
 *
 * @param {{
 *   appearanceOverrides?: object,
 *   weaponVisuals?: import("../Render/Characters/weapons/weaponVisualsPort.js").WeaponVisualsPort,
 * }} options
 */
export function createDefaultKinematicsPorts({ appearanceOverrides, weaponVisuals }) {
    const visuals = weaponVisuals ?? createEmptyWeaponVisuals();
    const getCharacterForActor = createCharacterResolver(appearanceOverrides);
    return {
        resolveCombatFacing,
        resolveSpriteBodyRotation,
        resolveWeaponStaticPoseName: visuals.resolveWeaponStaticPoseName,
        resolveWeaponDrawSlots: visuals.resolveWeaponDrawSlots,
        resolveMuzzleFromRig: createMuzzleResolver(visuals),
        getCharacterForActor,
        drawHeldWeapons: visuals.drawHeldWeapons,
    };
}
