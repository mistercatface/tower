/** @type {Map<string, import("./assemblyManifest.js").AssemblyManifest>} */
const registry = new Map();
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function registerAssemblyManifest(manifest) {
    registry.set(manifest.id, manifest);
}
/** @param {string} id */
export function getAssemblyManifest(id) {
    return registry.get(id);
}
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function resolveAssemblyManifest(manifest) {
    if (manifest.pads?.length) throw new Error(`Assembly "${manifest.id}" still declares pads — migrate to worldProps`);
    const { id, label, surfaceProfileId, surfaceAnimation, arena, link, wallSegments = [], arcWallSegments = [], worldProps = [], behaviors = {} } = manifest;
    return { id, label: label ?? id, surfaceProfileId, surfaceAnimation: surfaceAnimation === true, arena, wallSegments, arcWallSegments, worldProps, groupField: link.groupField, behaviors };
}
/** @returns {{ id: string, label: string }[]} */
export function listAssemblyManifests() {
    /** @type {{ id: string, label: string }[]} */
    const entries = [];
    for (const manifest of registry.values()) entries.push({ id: manifest.id, label: manifest.label ?? manifest.id });
    return entries;
}
/** @param {string} id */
export function getResolvedAssembly(id) {
    const manifest = getAssemblyManifest(id);
    if (!manifest) throw new Error(`Unknown assembly "${id}"`);
    return resolveAssemblyManifest(manifest);
}
