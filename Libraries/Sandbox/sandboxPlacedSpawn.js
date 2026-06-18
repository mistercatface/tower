import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState, removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Sandbox/sandboxFaction.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { applyPropBoxFootprint } from "../Props/propStrategy.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, isPoolRackSpawnAsset } from "./sandboxCapabilities.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { spawnPoolRack, tryExportPoolRackSpawnGroup } from "./spawnPoolRack.js";
function serializePlacedProp(prop) {
    const entry = { type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: resolveSandboxFaction(prop) };
    if (prop.halfExtents) {
        entry.width = prop.halfExtents.x * 2;
        entry.height = prop.halfExtents.y * 2;
    }
    return entry;
}
function tryExportSpawnGroup(members, meta) {
    return tryExportPoolRackSpawnGroup(members, meta);
}
export function spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, faction = SANDBOX_DEFAULT_FACTION, facing = 0, halfExtents = undefined) {
    const asset = getPropAsset(propTypeId);
    if (!asset) throw new Error(`Unknown prop type: ${propTypeId}`);
    if (isGridFloorBeltSpawnAsset(asset)) throw new Error(`Grid floor belt "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isGridPassagePowerSourceSpawnAsset(asset)) throw new Error(`Passage power source "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isPoolRackSpawnAsset(asset)) return spawnPoolRack(state, worldX, worldY, asset.sandbox.spawnRack, faction);
    const prop = new WorldProp(worldX, worldY, propTypeId, facing);
    if (halfExtents) applyPropBoxFootprint(prop, halfExtents.x, halfExtents.y);
    prop.faction = faction;
    addWorldPropToState(state, prop);
    return prop;
}
export function collectPlacedSandboxPropEntries(state) {
    const meta = getSandboxEntityMeta(state);
    const byGroup = new Map();
    const entries = [];
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead) return;
        const groupId = meta.getSpawnGroupId(prop.id);
        if (groupId) {
            const group = byGroup.get(groupId) ?? [];
            group.push(prop);
            byGroup.set(groupId, group);
            return;
        }
        entries.push(serializePlacedProp(prop));
    });
    for (const members of byGroup.values()) {
        const exported = tryExportSpawnGroup(members, meta);
        if (exported) {
            entries.push(exported);
            continue;
        }
        for (let i = 0; i < members.length; i++) entries.push(serializePlacedProp(members[i]));
    }
    return entries;
}
export function removeSandboxWorldProp(state, prop) {
    removeWorldPropFromState(state, prop);
}
