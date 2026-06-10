import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { spawnAssemblyRack } from "./spawnAssemblyRack.js";
/** @deprecated Use {@link spawnAssemblyRack} via {@link spawnAssembly}. */
export function spawnPoolRack(host, cueX, cueY, { faction, rackId, tableId, layout: layoutOverride } = {}) {
    const resolved = getResolvedAssembly("poolTable");
    if (!resolved) return null;
    return spawnAssemblyRack(host, cueX, cueY, { faction, rackId, groupId: tableId, resolved, layout: layoutOverride });
}
