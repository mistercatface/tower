import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resizeFloorPropHalfExtents, syncFloorPropCollisionShape, syncFloorTriggerAabb } from "../Spatial/zones/floorShapes.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyEntityMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} prop @param {import("./assemblies/assemblyManifest.js").AssemblyWorldPropManifest} entry @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>["play"]} play */
function applyAssemblyWorldPropOverrides(prop, entry, play) {
    if (entry.radiusU != null) prop.radius = entry.radiusU * (play.maxX - play.minX);
    else if (entry.radius != null) prop.radius = entry.radius;
    if (entry.radiusU != null || entry.radius != null) syncFloorPropCollisionShape(prop);
    if (entry.depth != null) prop.sinkDepth = entry.depth;
    if (entry.captureTolerance != null) prop.captureTolerance = entry.captureTolerance;
    if (entry.width != null || entry.height != null) {
        const halfWidth = (entry.width ?? entry.height) / 2;
        const halfHeight = (entry.height ?? entry.width) / 2;
        resizeFloorPropHalfExtents(prop, halfWidth, halfHeight);
    }
    if (entry.forceX != null || entry.forceY != null) {
        const pullTrigger = prop.triggers?.find((trigger) => trigger.effect === "pull");
        if (pullTrigger) {
            if (entry.forceX != null) pullTrigger.forceX = entry.forceX;
            if (entry.forceY != null) pullTrigger.forceY = entry.forceY;
        }
    }
    if (entry.wallMode === true) {
        prop.wallMode = true;
        prop.walls = [];
        prop.wallsUp = false;
    }
    if (entry.powered === false) prop.powered = false;
    if (entry.inputMode != null) prop.inputMode = entry.inputMode;
    if (entry.massThreshold != null) prop.massThreshold = entry.massThreshold;
    if (entry.invert === true) prop.invert = true;
    if (prop.aabb) syncFloorTriggerAabb(prop);
}
/** @param {object} prop @param {string[]} targets @param {Map<string, number>} propIdByManifestId @param {string} assemblyId @param {string} buttonId */
function wireAssemblyButtonLinks(prop, targets, propIdByManifestId, assemblyId, buttonId) {
    prop.buttonLinks = targets.map((manifestId) => {
        const linkedPropId = propIdByManifestId.get(manifestId);
        if (linkedPropId == null) throw new Error(`Assembly "${assemblyId}" button "${buttonId}" target "${manifestId}" not found`);
        return { type: "worldProp", id: linkedPropId };
    });
}
/**
 * @param {object} state
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string, groupId: string, rackId: string, groupField: string }} ctx
 */
export function spawnAssemblyWorldProps(state, layout, resolved, ctx) {
    /** @type {Map<string, number>} */
    const propIdByManifestId = new Map();
    /** @type {{ prop: object, targets: string[], buttonId: string }[]} */
    const pendingButtonLinks = [];
    /** @type {string | null} */
    let defaultPropId = null;
    for (let i = 0; i < resolved.worldProps.length; i++) {
        const entry = resolved.worldProps[i];
        const asset = getPropAsset(entry.prop);
        if (!asset) throw new Error(`Unknown prop "${entry.prop}" in assembly "${resolved.id}"`);
        const at = resolvePlacement(layout.play, entry.at);
        const prop = new WorldProp(at.x, at.y, entry.prop, entry.facing ?? 0);
        applyAssemblyWorldPropOverrides(prop, entry, layout.play);
        prop.faction = ctx.faction;
        getSandboxEntityMeta(state).setAssemblyRackId(prop.id, ctx.rackId);
        stampAssemblyEntityMember(state, prop, ctx.groupId, resolved.id, ctx.groupField);
        if (asset.flipper) applyFlipperAssemblyScale(prop, layout, asset);
        const overrides = resolved.behaviors[entry.prop];
        if (overrides) getSandboxEntityMeta(state).setBehaviorOverrides(prop.id, overrides);
        wakePushableBody(prop);
        addWorldPropToState(state, prop);
        if (entry.id) propIdByManifestId.set(entry.id, prop.id);
        if (entry.targets?.length) pendingButtonLinks.push({ prop, targets: entry.targets, buttonId: entry.id ?? String(i) });
        if (entry.id === "cue" || resolved.behaviors[entry.prop]?.cueStrike) defaultPropId = prop.id;
    }
    for (let i = 0; i < pendingButtonLinks.length; i++) {
        const { prop, targets, buttonId } = pendingButtonLinks[i];
        wireAssemblyButtonLinks(prop, targets, propIdByManifestId, resolved.id, buttonId);
    }
    return { defaultPropId, propIdByManifestId };
}
