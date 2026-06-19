import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState, removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Sandbox/sandboxFaction.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { applyPropBoxFootprint } from "../Props/propStrategy.js";
import { convexFootprintHalfExtents } from "../Math/Poly2D.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, isPoolRackSpawnAsset } from "./sandboxCapabilities.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { spawnPoolRack, tryExportPoolRackSpawnGroup } from "./spawnPoolRack.js";
import { tryExportLinkedBallChainSpawnGroup } from "./spawnLinkedBallChain.js";
import { serializeVisualOverride, stampPropVisualOverride } from "../Color/visualOverride.js";
function assetDefaultFootprintSpan(typeId) {
    const footprint = getPropAsset(typeId)?.physics?.localFootprint;
    if (!footprint?.length) return null;
    return convexFootprintHalfExtents(footprint);
}
function footprintDiffersFromAsset(prop) {
    const defaultSpan = assetDefaultFootprintSpan(prop.type);
    if (!defaultSpan || prop.shape?.type !== "Polygon") return false;
    const span = convexFootprintHalfExtents(prop.shape.vertices);
    return span.x !== defaultSpan.x || span.y !== defaultSpan.y;
}
function serializePlacedProp(prop) {
    const entry = { type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: resolveSandboxFaction(prop) };
    const assetRadius = getPropAsset(prop.type)?.physics?.radius;
    if (prop.radius != null && assetRadius != null && prop.radius !== assetRadius) entry.radius = prop.radius;
    if (footprintDiffersFromAsset(prop)) {
        const span = convexFootprintHalfExtents(prop.shape.vertices);
        entry.width = span.x * 2;
        entry.height = span.y * 2;
    }
    const visualOverride = serializeVisualOverride(prop);
    if (visualOverride) entry.visualOverride = visualOverride;
    return entry;
}
export function collectFlatPlacedSandboxPropEntries(state) {
    const props = [];
    const propIdToIndex = new Map();
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        propIdToIndex.set(prop.id, props.length);
        props.push(serializePlacedProp(prop));
    }
    return { props, propIdToIndex };
}
function tryExportSpawnGroup(members, meta) {
    return tryExportPoolRackSpawnGroup(members, meta) ?? tryExportLinkedBallChainSpawnGroup(members, meta);
}
export function spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, faction = SANDBOX_DEFAULT_FACTION, facing = 0, boxHalfExtents = undefined, visualOverride = undefined) {
    const asset = getPropAsset(propTypeId);
    if (!asset) throw new Error(`Unknown prop type: ${propTypeId}`);
    if (isGridFloorBeltSpawnAsset(asset)) throw new Error(`Grid floor belt "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isGridPassagePowerSourceSpawnAsset(asset)) throw new Error(`Passage power source "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isPoolRackSpawnAsset(asset)) return spawnPoolRack(state, worldX, worldY, asset.sandbox.spawnRack, faction);
    const prop = new WorldProp(worldX, worldY, propTypeId, facing);
    if (boxHalfExtents) applyPropBoxFootprint(prop, boxHalfExtents.x, boxHalfExtents.y);
    prop.faction = faction;
    if (visualOverride != null) stampPropVisualOverride(prop, visualOverride);
    addWorldPropToState(state, prop);
    return prop;
}
export function collectPlacedSandboxPropEntries(state) {
    const meta = getSandboxEntityMeta(state);
    const byGroup = new Map();
    const entries = [];
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        const groupId = meta.getSpawnGroupId(prop.id);
        if (groupId) {
            const group = byGroup.get(groupId) ?? [];
            group.push(prop);
            byGroup.set(groupId, group);
            continue;
        }
        entries.push(serializePlacedProp(prop));
    }
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
export function removeSandboxWorldProp(state, prop, spatialFrame = kineticSpatial) {
    removeWorldPropFromState(state, prop, spatialFrame, getSandboxEntityMeta(state));
}
