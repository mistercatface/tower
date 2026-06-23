import { worldPropAssets } from "../Props/PropCatalog.js";
import { isResizableBoxSpawnAsset, isSingleWorldPropSpawnAsset } from "./sandboxCapabilities.js";
export const SANDBOX_PRIMARY_PROP_IDS = ["ball", "snake_head", "flipper_left", "flipper_right"];
export const DEFAULT_BALL_SPAWN_RADIUS = 4;
export function orderSandboxPalettePropIds(propIds) {
    const available = new Set(propIds);
    const ordered = [];
    for (let i = 0; i < SANDBOX_PRIMARY_PROP_IDS.length; i++) {
        const id = SANDBOX_PRIMARY_PROP_IDS[i];
        if (available.has(id)) ordered.push(id);
    }
    const rest = propIds.filter((id) => !SANDBOX_PRIMARY_PROP_IDS.includes(id)).sort((a, b) => a.localeCompare(b));
    return ordered.concat(rest);
}
export function isBallFamilyAsset(asset) {
    return asset?.primitive === "sphere" && isSingleWorldPropSpawnAsset(asset) && asset.physics?.isKinetic !== false;
}
export function isBlockFamilyAsset(asset) {
    return asset?.primitive === "polygon" && isSingleWorldPropSpawnAsset(asset) && asset.physics?.isKinetic !== false;
}
export function isShapeFamilyAsset(asset) {
    return isBallFamilyAsset(asset) || isBlockFamilyAsset(asset);
}
export function assetDefaultBallRadius(asset) {
    return asset?.physics?.radius ?? DEFAULT_BALL_SPAWN_RADIUS;
}
export function blockPresetUsesResizableFootprint(propId) {
    return isResizableBoxSpawnAsset(worldPropAssets[propId]);
}
