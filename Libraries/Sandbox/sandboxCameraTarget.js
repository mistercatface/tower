/** @param {object | null | undefined} prop */
export function isSandboxCameraTarget(prop) {
    return Boolean(prop?.sandboxCameraTarget);
}
/**
 * @param {object} prop
 * @param {boolean} enabled
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 */
export function setSandboxCameraTarget(prop, enabled, registry) {
    if (enabled) {
        registry.forEachOfKind("worldProp", (other) => {
            if (other !== prop) other.sandboxCameraTarget = false;
        });
        prop.sandboxCameraTarget = true;
    } else prop.sandboxCameraTarget = false;
}
/** @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry */
export function findSandboxCameraTargetWorldProp(registry) {
    let target = null;
    registry.forEachOfKind("worldProp", (prop) => {
        if (prop.sandboxCameraTarget) target = prop;
    });
    return target;
}
/**
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 * @param {number} dtMs
 */
export function tickSandboxCameraFollow(viewport, registry, dtMs) {
    const target = findSandboxCameraTargetWorldProp(registry);
    if (!target) return;
    const factor = 1 - Math.exp(-8 * (dtMs / 1000));
    viewport.follow(target.x, target.y, factor);
}
