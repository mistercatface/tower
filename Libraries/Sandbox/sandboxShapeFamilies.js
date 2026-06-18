import { getPropAsset } from "../Props/PropCatalog.js";
import { isResizableBoxSpawnAsset, isSingleWorldPropSpawnAsset } from "./sandboxCapabilities.js";
export const SANDBOX_PRIMARY_PROP_IDS = ["ball", "block", "snake_head", "goal_orb", "flipper_left", "flipper_right"];
export const BLOCK_SPAWN_PRESET_OPTIONS = [
    { id: "block", label: "2×4 block" },
    { id: "hex_block", label: "Hex block" },
    { id: "tri_wedge", label: "Tri wedge" },
    { id: "crate", label: "Crate" },
    { id: "custom_box", label: "Custom box" },
];
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
    return asset?.primitive === "sphere" && isSingleWorldPropSpawnAsset(asset);
}
export function isBlockFamilyAsset(asset) {
    return asset?.primitive === "polygon" && isSingleWorldPropSpawnAsset(asset) && asset.physics?.isKinetic !== false;
}
export function isShapeFamilyAsset(asset) {
    return isBallFamilyAsset(asset) || isBlockFamilyAsset(asset);
}
export function resolveSpawnPropTypeId(spawnPropId, blockPresetId) {
    const asset = getPropAsset(spawnPropId);
    if (asset?.id === "block") return blockPresetId;
    return spawnPropId;
}
export function resolveBlockPresetForAsset(asset) {
    if (!asset) return "block";
    const match = BLOCK_SPAWN_PRESET_OPTIONS.find((option) => option.id === asset.id);
    return match ? asset.id : "block";
}
export function assetDefaultBallRadius(asset) {
    return asset?.physics?.radius ?? DEFAULT_BALL_SPAWN_RADIUS;
}
export function blockPresetUsesResizableFootprint(presetId) {
    return isResizableBoxSpawnAsset(getPropAsset(presetId));
}
