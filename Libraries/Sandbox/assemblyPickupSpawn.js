import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
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
        if (!asset) throw new Error(`Unknown prop "${entry.prop}" in assembly "${resolved.id}"`);
        const at = resolvePlacement(layout.play, entry.at);
        const pickup = new Pickup(at.x, at.y, entry.prop, entry.facing ?? 0);
        pickup.faction = ctx.faction;
        pickup.assemblyRackId = ctx.rackId;
        stampAssemblyGroupMember(pickup, ctx.groupId, resolved.id, ctx.groupField);
        if (asset.flipper) applyFlipperAssemblyScale(pickup, layout, asset);
        const overrides = resolved.behaviors[entry.prop];
        if (overrides) pickup.sandboxBehaviorOverrides = overrides;
        wakePushableBody(pickup);
        host.addPickup(pickup);
        if (entry.id) pickupIdByManifestId.set(entry.id, pickup.id);
        if (entry.id === "cue" || resolved.behaviors[entry.prop]?.cueStrike) defaultPickupId = pickup.id;
    }
    return { defaultPickupId, pickupIdByManifestId };
}
