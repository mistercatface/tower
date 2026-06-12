import { WorldProp } from "../../Entities/WorldProp.js";
import { CircleShape } from "../Spatial/collision/Shapes.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resizeFloorPropHalfExtents, syncFloorTriggerAabb } from "../Spatial/zones/floorShapes.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyEntityMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} prop @param {import("./assemblies/assemblyManifest.js").AssemblyWorldPropManifest} entry */
function applyAssemblyFloorPropOverrides(prop, entry) {
    if (entry.radius != null) {
        prop.radius = entry.radius;
        prop.shape = new CircleShape(entry.radius);
    }
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
    if (prop.aabb) syncFloorTriggerAabb(prop);
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
    /** @type {string | null} */
    let defaultPropId = null;
    for (let i = 0; i < resolved.worldProps.length; i++) {
        const entry = resolved.worldProps[i];
        const asset = getPropAsset(entry.prop);
        if (!asset) throw new Error(`Unknown prop "${entry.prop}" in assembly "${resolved.id}"`);
        const at = resolvePlacement(layout.play, entry.at);
        const prop = new WorldProp(at.x, at.y, entry.prop, entry.facing ?? 0);
        applyAssemblyFloorPropOverrides(prop, entry);
        prop.faction = ctx.faction;
        getSandboxEntityMeta(state).setAssemblyRackId(prop.id, ctx.rackId);
        stampAssemblyEntityMember(state, prop, ctx.groupId, resolved.id, ctx.groupField);
        if (asset.flipper) applyFlipperAssemblyScale(prop, layout, asset);
        const overrides = resolved.behaviors[entry.prop];
        if (overrides) getSandboxEntityMeta(state).setBehaviorOverrides(prop.id, overrides);
        wakePushableBody(prop);
        addWorldPropToState(state, prop);
        if (entry.id) propIdByManifestId.set(entry.id, prop.id);
        if (entry.id === "cue" || resolved.behaviors[entry.prop]?.cueStrike) defaultPropId = prop.id;
    }
    return { defaultPropId, propIdByManifestId };
}
