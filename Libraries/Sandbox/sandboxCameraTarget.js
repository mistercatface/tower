/** @param {object | null | undefined} pickup */
export function isSandboxCameraTarget(pickup) {
    return Boolean(pickup?.sandboxCameraTarget);
}
/**
 * @param {object} pickup
 * @param {boolean} enabled
 * @param {object[]} pickups
 */
export function setSandboxCameraTarget(pickup, enabled, pickups) {
    if (enabled) {
        for (let i = 0; i < pickups.length; i++) {
            const other = pickups[i];
            if (other !== pickup) other.sandboxCameraTarget = false;
        }
        pickup.sandboxCameraTarget = true;
    } else pickup.sandboxCameraTarget = false;
}
/** @param {object[]} pickups */
export function findSandboxCameraTargetPickup(pickups) {
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.isDead && pickup.sandboxCameraTarget) return pickup;
    }
    return null;
}
/**
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {object[]} pickups
 * @param {number} dtMs
 */
export function tickSandboxCameraFollow(viewport, pickups, dtMs) {
    const target = findSandboxCameraTargetPickup(pickups);
    if (!target) return;
    const factor = 1 - Math.exp(-8 * (dtMs / 1000));
    viewport.follow(target.x, target.y, factor);
}
