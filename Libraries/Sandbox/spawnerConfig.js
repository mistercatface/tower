import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { isSandboxSpawnable } from "./sandboxCapabilities.js";
import { DRAG_LAUNCH_DEFAULTS } from "./dragLaunch.js";
/** @param {object | null | undefined} asset */
export function isSpawnerProp(asset) {
    return asset?.sandbox?.spawner != null && typeof asset.sandbox.spawner === "object";
}
/** @param {object | null | undefined} pickup @param {object | null | undefined} asset */
export function resolveSpawnerPropId(pickup, asset) {
    const picked = pickup?.sandboxSpawnerPropId;
    if (picked && getPropAsset(picked)) return picked;
    const fallback = asset?.sandbox?.spawner?.defaultPropId;
    if (fallback && getPropAsset(fallback)) return fallback;
    return "beach_ball";
}
/** @param {object | null | undefined} pickup @param {object | null | undefined} asset */
export function getSpawnerDragConfig(_pickup, asset) {
    const overrides = asset?.sandbox?.spawner?.dragLaunch;
    return { ...DRAG_LAUNCH_DEFAULTS, ...(overrides && typeof overrides === "object" ? overrides : {}) };
}
/** @param {object} pickup @param {object | null | undefined} asset */
export function getSpawnerOutletWorld(pickup, asset) {
    const resolver = asset?.sandbox?.spawner?.getOutletWorld;
    if (typeof resolver === "function") return resolver(pickup, asset);
    const facing = pickup.facing ?? 0;
    const reach = pickup._collisionBoundingRadius ?? pickup.radius ?? 8;
    return { x: pickup.x + Math.cos(facing) * reach, y: pickup.y + Math.sin(facing) * reach, nx: Math.cos(facing), ny: Math.sin(facing) };
}
/** @returns {string[]} */
export function listSpawnerSpawnPropIds() {
    return Object.keys(getWorldPropDefinitions())
        .filter((id) => {
            const asset = getPropAsset(id);
            return isSandboxSpawnable(asset) && !isSpawnerProp(asset);
        })
        .sort();
}
