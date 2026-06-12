/** @param {object | null | undefined} pickup */
export function isSandboxCameraTarget(pickup) {
    return Boolean(pickup?.sandboxCameraTarget);
}
/**
 * @param {object} pickup
 * @param {boolean} enabled
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 */
export function setSandboxCameraTarget(pickup, enabled, registry) {
    if (enabled) {
        registry.forEachOfKind("pickup", (other) => {
            if (other !== pickup) other.sandboxCameraTarget = false;
        });
        pickup.sandboxCameraTarget = true;
    } else pickup.sandboxCameraTarget = false;
}
/** @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry */
export function findSandboxCameraTargetPickup(registry) {
    let target = null;
    registry.forEachOfKind("pickup", (pickup) => {
        if (!pickup.isDead && pickup.sandboxCameraTarget) target = pickup;
    });
    return target;
}
/**
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 * @param {number} dtMs
 */
export function tickSandboxCameraFollow(viewport, registry, dtMs) {
    const target = findSandboxCameraTargetPickup(registry);
    if (!target) return;
    const factor = 1 - Math.exp(-8 * (dtMs / 1000));
    viewport.follow(target.x, target.y, factor);
}
