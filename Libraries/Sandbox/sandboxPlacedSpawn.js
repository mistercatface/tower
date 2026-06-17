import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState, removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, isPoolRackSpawnAsset } from "./sandboxCapabilities.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { spawnPoolRack, tryExportPoolRackSpawnGroup } from "./spawnPoolRack.js";
/** @param {object} prop */
function serializePlacedProp(prop) {
    return { type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: resolveSandboxFaction(prop) };
}
/**
 * @param {object[]} members
 * @param {import("../../GameState/sandboxEntityMeta.js").SandboxEntityMetaStore} meta
 * @returns {{ type: string, x: number, y: number, facing: number, faction: string } | null}
 */
function tryExportSpawnGroup(members, meta) {
    return tryExportPoolRackSpawnGroup(members, meta);
}
/**
 * Spawn a placed sandbox prop from a catalog type id (editor picker or scene JSON).
 * Grid floor belts are stamped separately — not handled here.
 *
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {string} propTypeId
 * @param {string} [faction]
 * @param {number} [facing]
 * @returns {object | null} cue ball for pool racks, spawned prop for singles
 */
export function spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, faction = SANDBOX_DEFAULT_FACTION, facing = 0) {
    const asset = getPropAsset(propTypeId);
    if (!asset) throw new Error(`Unknown prop type: ${propTypeId}`);
    if (isGridFloorBeltSpawnAsset(asset)) throw new Error(`Grid floor belt "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isGridPassagePowerSourceSpawnAsset(asset)) throw new Error(`Passage power source "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isPoolRackSpawnAsset(asset)) return spawnPoolRack(state, worldX, worldY, asset.sandbox.spawnRack, faction);
    const prop = new WorldProp(worldX, worldY, propTypeId, facing);
    prop.faction = faction;
    addWorldPropToState(state, prop);
    return prop;
}
/** @param {object} state @returns {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
export function collectPlacedSandboxPropEntries(state) {
    const meta = getSandboxEntityMeta(state);
    /** @type {Map<string, object[]>} */
    const byGroup = new Map();
    /** @type {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
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
/** @param {object} state @param {object} prop */
export function removeSandboxWorldProp(state, prop) {
    removeWorldPropFromState(state, prop);
}
