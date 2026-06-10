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
    const { arena, props = [], voidCircles, pickups, link, behaviors = {}, spawn = [] } = manifest;
    return { id: manifest.id, version: manifest.version ?? 2, arena, props, voidCircles, pickups, groupField: link.groupField, behaviors, spawn };
}
/** @param {string} [id] */
export function getResolvedAssembly(id = "poolTable") {
    const manifest = getAssemblyManifest(id);
    if (!manifest) return null;
    return resolveAssemblyManifest(manifest);
}
