/**
 * @typedef {object} WeaponVisualsPort
 * @property {(actor: object) => string} resolveWeaponStaticPoseName
 * @property {(actor: object) => object[]} resolveWeaponDrawSlots
 * @property {(rigLocal: object, slot: object, project: Function) => object} resolveProjectedHandsForSlot
 * @property {(gunId: string) => number} getBarrelRatioForGunId
 * @property {(rigLocal: object, actor: object, sceneRenderer: object, config: object, facing: object) => void} drawHeldWeapons
 */
/** @returns {WeaponVisualsPort} */
export function createEmptyWeaponVisuals() {
    return {
        resolveWeaponStaticPoseName: () => "IDLE",
        resolveWeaponDrawSlots: () => [],
        resolveProjectedHandsForSlot: (_rigLocal, _slot, project) => project({ x: 0, y: 0, z: 0 }),
        getBarrelRatioForGunId: () => 0.5,
        drawHeldWeapons: () => {},
    };
}
