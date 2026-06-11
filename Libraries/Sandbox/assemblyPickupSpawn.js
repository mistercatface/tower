import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
/** @param {import("./assemblies/assemblyManifest.js").AssemblyPickupManifest[]} pickups */
export function validateAssemblyPickupManifest(pickups) {
    for (let i = 0; i < pickups.length; i++) if (!getPropAsset(pickups[i].prop)) return false;
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
    /** @type {Map<string, number>} */
    const pickupIdByManifestId = new Map();
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
        if (entry.id) pickupIdByManifestId.set(entry.id, pickup.id);
        const pickId = resolveDefaultPickupId(entry, pickup.id, resolved);
        if (pickId != null) defaultPickupId = pickId;
    }
    return { defaultPickupId, pickupIdByManifestId };
}
