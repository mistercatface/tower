import { isSandboxEquippable } from "../sandboxCapabilities.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";
import { manualFireWorldProp } from "../../Combat/worldPropManualFire.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
export const SHOOT_BEHAVIOR_ID = "shoot";
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createShootBehavior(state) {
    let isShooting = false;
    let aimX = 0;
    let aimY = 0;
    return {
        id: SHOOT_BEHAVIOR_ID,
        supports(prop, asset) {
            return isSandboxEquippable(asset) && normalizeWeaponLoadout(prop?.weaponLoadout ?? []).length > 0;
        },
        onPointerDown(prop, world, e) {
            isShooting = true;
            aimX = world.x;
            aimY = world.y;
            return true;
        },
        onPointerMove(prop, world, e) {
            aimX = world.x;
            aimY = world.y;
        },
        onPointerUp(prop, e) {
            isShooting = false;
        },
        tick(prop, dt) {
            manualFireWorldProp(state, prop, aimX, aimY, dt, isShooting);
        },
        reset() {
            isShooting = false;
        },
    };
}
