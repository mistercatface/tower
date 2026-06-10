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
export function getDefaultPoolTableAssemblyManifest() {
    return getAssemblyManifest("poolTable");
}
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function resolveAssemblyManifest(manifest) {
    const { scale, arena, voidCircles, pickups, link, behaviors = {}, spawn = [] } = manifest;
    return { id: manifest.id, version: manifest.version ?? 2, scale: { ballRadius: scale.ballRadius }, arena, voidCircles, pickups, groupField: link.groupField, behaviors, spawn };
}
/** @param {string} [id] */
export function getResolvedAssembly(id = "poolTable") {
    const manifest = getAssemblyManifest(id);
    if (!manifest) return null;
    return resolveAssemblyManifest(manifest);
}
