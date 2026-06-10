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
    const { arena, props = [], voidCircles, pickups, link, behaviors = {}, spawn = [], label, surfaceProfileId, surfaceAnimation } = manifest;
    return {
        id: manifest.id,
        label: label ?? manifest.id,
        surfaceProfileId,
        surfaceAnimation: surfaceAnimation === true,
        version: manifest.version ?? 2,
        arena,
        props,
        voidCircles,
        pickups,
        groupField: link.groupField,
        behaviors,
        spawn,
    };
}
/** @returns {{ id: string, label: string }[]} */
export function listAssemblyManifests() {
    /** @type {{ id: string, label: string }[]} */
    const entries = [];
    for (const manifest of registry.values()) entries.push({ id: manifest.id, label: manifest.label ?? manifest.id });
    return entries;
}
/** @param {string} [id] */
export function getResolvedAssembly(id = "poolTable") {
    const manifest = getAssemblyManifest(id);
    if (!manifest) return null;
    return resolveAssemblyManifest(manifest);
}
