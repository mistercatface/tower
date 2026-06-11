import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
import { attachPropButton } from "./propAttachedButton.js";
/** @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved @param {string} propId */
function assemblyAllowsProp(resolved, propId) {
    if (!resolved.props.length) return true;
    return resolved.props.includes(propId);
}
/** @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved */
export function validateAssemblyPickupManifest(resolved) {
    for (let i = 0; i < resolved.pickups.length; i++) {
        const entry = resolved.pickups[i];
        if (!assemblyAllowsProp(resolved, entry.prop) || !getPropAsset(entry.prop)) return false;
    }
    return true;
}
/**
 * @param {object} pickup
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {import("./assemblies/assemblyManifest.js").AssemblyPickupManifest} entry
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {object} asset
 */
function configureAssemblyPickup(pickup, layout, entry, resolved, asset) {
    if (asset.flipper) applyFlipperAssemblyScale(pickup, layout, asset);
    if (entry.button) attachPropButton(pickup, layout, entry.button);
    const overrides = resolved.behaviors[entry.prop];
    if (overrides) pickup.sandboxBehaviorOverrides = overrides;
}
/** @param {import("./assemblies/assemblyManifest.js").AssemblyPickupManifest} entry @param {string} pickupId @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved */
function resolveDefaultPickupId(entry, pickupId, resolved) {
    if (entry.id === "cue") return pickupId;
    if (resolved.behaviors[entry.prop]?.cueStrike) return pickupId;
    return null;
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {{ faction?: string, groupId: string, rackId: string, groupField: string }} ctx
 */
export function spawnAssemblyPickups(host, layout, resolved, ctx) {
    /** @type {string | null} */
    let defaultPickupId = null;
    for (let i = 0; i < resolved.pickups.length; i++) {
        const entry = resolved.pickups[i];
        const asset = getPropAsset(entry.prop);
        const at = resolvePlacement(layout.play, entry.at);
        const pickup = new Pickup(at.x, at.y, entry.prop, entry.facing ?? 0);
        pickup.faction = ctx.faction;
        pickup.assemblyRackId = ctx.rackId;
        stampAssemblyGroupMember(pickup, ctx.groupId, resolved.id, ctx.groupField);
        configureAssemblyPickup(pickup, layout, entry, resolved, asset);
        wakePushableBody(pickup);
        host.addPickup(pickup);
        const pickId = resolveDefaultPickupId(entry, pickup.id, resolved);
        if (pickId != null) defaultPickupId = pickId;
    }
    return { defaultPickupId };
}
