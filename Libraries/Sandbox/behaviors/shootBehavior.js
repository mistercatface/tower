import { isSandboxEquippable } from "../sandboxCapabilities.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";
import { manualFirePickup } from "../../Combat/pickupManualFire.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
export const SHOOT_BEHAVIOR_ID = "shoot";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createShootBehavior() {
    let isShooting = false;
    let aimX = 0;
    let aimY = 0;
    return {
        id: SHOOT_BEHAVIOR_ID,
        supports(pickup, asset) {
            return isSandboxEquippable(asset) && normalizeWeaponLoadout(pickup?.weaponLoadout ?? []).length > 0;
        },
        onPointerDown(pickup, world, e) {
            isShooting = true;
            aimX = world.x;
            aimY = world.y;
            return true;
        },
        onPointerMove(pickup, world, e) {
            aimX = world.x;
            aimY = world.y;
            // Update facing visually immediately
            pickup.facing = Math.atan2(aimY - pickup.y, aimX - pickup.x);
        },
        onPointerUp(pickup, e) {
            isShooting = false;
        },
        tick(pickup, dt, host) {
            if (!isShooting) return;
            const state = host.getWorldState?.();
            if (!state) return;
            manualFirePickup(state, pickup, aimX, aimY, dt);
        },
        reset() {
            isShooting = false;
        },
    };
}
