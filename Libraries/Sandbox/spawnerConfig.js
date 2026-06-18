import { WorldProp } from "../../Entities/WorldProp.js";
import { resolveSandboxFaction } from "../Sandbox/sandboxFaction.js";
import { applyDragLaunchVelocity } from "./dragLaunch.js";
import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { isSandboxSpawnable } from "./sandboxCapabilities.js";
import { DRAG_LAUNCH_DEFAULTS } from "./dragLaunch.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
/** @param {object | null | undefined} asset */
export function isSpawnerProp(asset) {
    return asset?.sandbox?.spawner != null && typeof asset.sandbox.spawner === "object";
}
/** @param {object | null | undefined} prop */
export function isSpawnerWorldProp(prop) {
    return isSpawnerProp(getPropAsset(prop?.type));
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function resolveSpawnerPropId(prop, asset) {
    return prop?.sandboxSpawnerPropId ?? asset.sandbox.spawner.defaultPropId;
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function getSpawnerDragConfig(_prop, asset) {
    const overrides = asset?.sandbox?.spawner?.dragLaunch;
    return { ...DRAG_LAUNCH_DEFAULTS, ...(overrides && typeof overrides === "object" ? overrides : {}) };
}
/** @param {object} prop @param {object | null | undefined} asset */
export function getSpawnerOutletWorld(prop, asset) {
    const resolver = asset?.sandbox?.spawner?.getOutletWorld;
    if (typeof resolver === "function") return resolver(prop, asset);
    const facing = prop.facing ?? 0;
    const reach = prop._collisionBoundingRadius ?? prop.radius ?? 8;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return { x: prop.x + cos * reach, y: prop.y + sin * reach, nx: cos, ny: sin };
}
/**
 * @param {object} state
 * @param {object} spawnerWorldProp
 * @param {{ power?: number, nx?: number, ny?: number }} [options]
 */
export function fireSpawner(state, spawnerWorldProp, { power, nx, ny } = {}) {
    const asset = getPropAsset(spawnerWorldProp.type);
    if (!isSpawnerProp(asset)) return null;
    const config = getSpawnerDragConfig(spawnerWorldProp, asset);
    const outlet = getSpawnerOutletWorld(spawnerWorldProp, asset);
    const launchNx = nx ?? outlet.nx;
    const launchNy = ny ?? outlet.ny;
    const launchPower = power ?? config.maxPower;
    const spawnId = resolveSpawnerPropId(spawnerWorldProp, asset);
    const spawned = new WorldProp(outlet.x, outlet.y, spawnId, Math.atan2(launchNy, launchNx));
    spawned.faction = resolveSandboxFaction(spawnerWorldProp);
    applyDragLaunchVelocity(spawned, launchNx, launchNy, launchPower);
    addWorldPropToState(state, spawned);
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
