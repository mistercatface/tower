import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} state @param {object} prop */
export function isSandboxCameraTarget(state, prop) {
    return getSandboxEntityMeta(state).isCameraTarget(prop.id);
}
/** @param {object} state @param {object} prop @param {boolean} enabled */
export function setSandboxCameraTarget(state, prop, enabled) {
    const meta = getSandboxEntityMeta(state);
    if (enabled) meta.setCameraTarget(prop.id, true);
    else meta.setCameraTarget(prop.id, false);
}
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry */
export function findSandboxCameraTargetWorldProp(state, registry) {
    const targetId = getSandboxEntityMeta(state).findCameraTargetEntityId();
    if (targetId == null) return null;
    return registry.getLive(targetId);
}
/**
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {object} state
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 * @param {number} dtMs
 */
export function tickSandboxCameraFollow(viewport, state, registry, dtMs) {
    const target = findSandboxCameraTargetWorldProp(state, registry);
    if (!target) return;
    const factor = 1 - Math.exp(-8 * (dtMs / 1000));
    viewport.follow(target.x, target.y, factor);
}
