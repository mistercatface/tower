import { buildSandboxPad } from "./sandboxPads.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
import { addPadToState } from "../../GameState/EntityRegistry.js";
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
            if (entry.captureTolerance != null) options.captureTolerance = entry.captureTolerance;
            if (entry.powered === false) options.powered = false;
        } else if (entry.preset === "pull") {
            options.halfWidth = entry.halfWidth;
            options.halfHeight = entry.halfHeight;
            options.forceX = entry.forceX;
            options.forceY = entry.forceY;
            if (entry.wallMode === true) options.wallMode = true;
            if (entry.powered === false) options.powered = false;
        } else if (entry.preset === "button") {
            options.radius = entry.radius;
            if (entry.inputMode != null) options.inputMode = entry.inputMode;
            if (entry.massThreshold != null) options.massThreshold = entry.massThreshold;
            if (entry.invert === true) options.invert = true;
            /** @type {import("./sandboxPadLinks.js").ButtonLinkTarget[]} */
            const buttonLinks = [];
            for (let t = 0; t < entry.targets.length; t++) {
                const manifestId = entry.targets[t];
                const pickupId = pickupIdByManifestId.get(manifestId);
                if (pickupId != null) buttonLinks.push({ type: "pickup", id: pickupId });
                else buttonLinks.push({ type: "pad", id: `${groupId}:pad:${manifestId}` });
            }
            options.buttonLinks = buttonLinks;
        }
        const pad = buildSandboxPad(state, entry.preset, entry.x, entry.y, options);
        stampAssemblyGroupMember(pad, groupId, resolvedId, groupField);
        addPadToState(state, pad);
    }
}
