import { resolveCombatFacing, resolveSpriteBodyRotation } from "./anim/combatFacing.js";
import { createCharacterResolver } from "../Render/Characters/appearance.js";
import { createMuzzleResolver } from "../Render/Characters/weapons/muzzle.js";

function createEmptyWeaponVisuals() {
    return {
        resolveWeaponStaticPoseName: () => "IDLE",
        resolveWeaponDrawSlots: () => [],
        drawHeldWeapons: () => {},
    };
}

/**
 * Default kinematics port bundle for humanoid actors.
 *
 * @param {{
 *   appearanceOverrides?: object,
 *   gunIdToVisual?: Record<string, string>,
 *   weaponVisuals?: ReturnType<import("../../Games/tower/render/createWeaponVisuals.js").createWeaponVisuals>,
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
