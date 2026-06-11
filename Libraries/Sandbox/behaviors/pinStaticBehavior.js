import { getPropAsset } from "../../Props/PropCatalog.js";
export const PIN_STATIC_BEHAVIOR_ID = "pinStatic";
/** @param {object} pickup */
export function isPinStaticPickup(pickup) {
    return Boolean(getPropAsset(pickup?.type)?.sandbox?.behaviors?.includes(PIN_STATIC_BEHAVIOR_ID));
}
/** @param {object} pickup */
function pinPickup(pickup) {
    pickup.vx = 0;
    pickup.vy = 0;
    pickup.angularVelocity = 0;
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createPinStaticBehavior() {
    return {
        id: PIN_STATIC_BEHAVIOR_ID,
        supports(_pickup, asset) {
            return asset?.sandbox?.behaviors?.includes(PIN_STATIC_BEHAVIOR_ID) ?? false;
        },
        tickWorld(_dt, host) {
            const pickups = host.getPickups();
            for (let i = 0; i < pickups.length; i++) {
                const pickup = pickups[i];
                if (pickup.isDead || !isPinStaticPickup(pickup)) continue;
                pinPickup(pickup);
            }
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
