import { buildSandboxPad } from "./sandboxPads.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
/**
 * @param {object} state
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {{ groupId: string, resolvedId: string, groupField: string, pickupIdByManifestId: Map<string, number> }} ctx
 */
export function spawnAssemblyPads(state, layout, { groupId, resolvedId, groupField, pickupIdByManifestId }) {
    for (let i = 0; i < layout.pads.length; i++) {
        const entry = layout.pads[i];
        const options = { id: `${groupId}:pad:${entry.id}` };
        if (entry.preset === "sink") {
            options.radius = entry.radius;
            options.sinkDepth = entry.sinkDepth;
        } else if (entry.preset === "pull") {
            options.halfWidth = entry.halfWidth;
            options.halfHeight = entry.halfHeight;
            options.forceX = entry.forceX;
            options.forceY = entry.forceY;
        } else if (entry.preset === "button") {
            options.radius = entry.radius;
            options.targetPickupId = pickupIdByManifestId.get(entry.target);
        }
        const pad = buildSandboxPad(state, entry.preset, entry.x, entry.y, options);
        stampAssemblyGroupMember(pad, groupId, resolvedId, groupField);
        state.sandboxPads.push(pad);
    }
}
