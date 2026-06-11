import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
import { applyFlipperAssemblyScale } from "./behaviors/flipperBehavior.js";
import { buildSandboxPad } from "./sandboxPads.js";
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
 * @param {object} state
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {object} pickup
 * @param {import("./assemblies/assemblyManifest.js").AssemblyPickupManifest["button"]} config
 * @param {{ groupId: string, resolvedId: string, groupField: string }} ctx
 */
function spawnAssemblyButtonPad(state, layout, pickup, config, ctx) {
    if (!config) return;
    const play = layout.play;
    const playW = play.maxX - play.minX;
    const placement = config.at ?? (typeof config.u === "number" && typeof config.v === "number" ? { u: config.u, v: config.v } : null);
    if (!placement) throw new Error("assembly button pad requires at or u/v playfield placement");
    const at = resolvePlacement(play, placement);
    const radius = (config.radiusU ?? 0.045) * playW;
    const trigger = config.trigger ?? "flipper";
    const pad = buildSandboxPad(state, "button", at.x, at.y, {
        id: `${pickup.id}:button`,
        radius,
        targetPickupId: pickup.id,
        triggers: [{ when: "pointerDown", effect: trigger, targetPickupId: pickup.id }],
    });
    if (!pad) return;
    stampAssemblyGroupMember(pad, ctx.groupId, ctx.resolvedId, ctx.groupField);
    if (!state.sandboxPads) state.sandboxPads = [];
    state.sandboxPads.push(pad);
}
/**
 * @param {object} pickup
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {import("./assemblies/assemblyManifest.js").AssemblyPickupManifest} entry
 * @param {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} resolved
 * @param {object} asset
 * @param {object} state
 * @param {{ groupId: string, rackId: string, groupField: string }} ctx
 */
function configureAssemblyPickup(pickup, layout, entry, resolved, asset, state, ctx) {
    if (asset.flipper) applyFlipperAssemblyScale(pickup, layout, asset);
    if (entry.button) spawnAssemblyButtonPad(state, layout, pickup, entry.button, { groupId: ctx.groupId, resolvedId: resolved.id, groupField: ctx.groupField });
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
    const state = host.getWorldState();
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
        configureAssemblyPickup(pickup, layout, entry, resolved, asset, state, ctx);
        wakePushableBody(pickup);
        host.addPickup(pickup);
        const pickId = resolveDefaultPickupId(entry, pickup.id, resolved);
        if (pickId != null) defaultPickupId = pickId;
    }
    return { defaultPickupId };
}
