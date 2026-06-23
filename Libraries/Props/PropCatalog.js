import propCatalog from "../../Assets/props/index.js";

export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}

export function formatSandboxSpawnLabel(propId) {
    const asset = propCatalog[propId];
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
