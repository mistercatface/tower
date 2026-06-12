import { Pickup } from "../../Entities/Pickup.js";
import { resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { applyDragLaunchVelocity } from "./dragLaunch.js";
import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { isSandboxSpawnable } from "./sandboxCapabilities.js";
import { DRAG_LAUNCH_DEFAULTS } from "./dragLaunch.js";
/** @param {object | null | undefined} asset */
export function isSpawnerProp(asset) {
    return asset?.sandbox?.spawner != null && typeof asset.sandbox.spawner === "object";
}
/** @param {object | null | undefined} pickup */
export function isSpawnerPickup(pickup) {
    return isSpawnerProp(getPropAsset(pickup?.type));
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
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return { x: pickup.x + cos * reach, y: pickup.y + sin * reach, nx: cos, ny: sin };
}
/**
 * @param {object} state
 * @param {object} spawnerPickup
 * @param {{ power?: number, nx?: number, ny?: number }} [options]
 */
export function fireSpawner(state, spawnerPickup, { power, nx, ny } = {}) {
    const asset = getPropAsset(spawnerPickup.type);
    if (!isSpawnerProp(asset)) return null;
    const config = getSpawnerDragConfig(spawnerPickup, asset);
    const outlet = getSpawnerOutletWorld(spawnerPickup, asset);
    const launchNx = nx ?? outlet.nx;
    const launchNy = ny ?? outlet.ny;
    const launchPower = power ?? config.maxPower;
    const spawnId = resolveSpawnerPropId(spawnerPickup, asset);
    if (!getPropAsset(spawnId)) return null;
    const spawned = new Pickup(outlet.x, outlet.y, spawnId, Math.atan2(launchNy, launchNx));
    spawned.faction = resolveSandboxFaction(spawnerPickup);
    applyDragLaunchVelocity(spawned, launchNx, launchNy, launchPower);
    state.pickups.push(spawned);
    state.entityRegistry.registerPickup(spawned);
    return spawned;
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
