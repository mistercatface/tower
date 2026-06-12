import { buildSandboxPad } from "./sandboxPads.js";
import { stampAssemblyEntityMember } from "./assemblies/assemblyLink.js";
import { addPadToState } from "../../GameState/EntityRegistry.js";
/**
 * @param {object} state
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {{ groupId: string, resolvedId: string, groupField: string, propIdByManifestId: Map<string, number> }} ctx
 */
export function spawnAssemblyPads(state, layout, { groupId, resolvedId, groupField, propIdByManifestId }) {
    for (let i = 0; i < layout.pads.length; i++) {
        const entry = layout.pads[i];
        const options = { id: `${groupId}:pad:${entry.id}` };
        if (entry.preset === "button") {
            options.radius = entry.radius;
            if (entry.inputMode != null) options.inputMode = entry.inputMode;
            if (entry.massThreshold != null) options.massThreshold = entry.massThreshold;
            if (entry.invert === true) options.invert = true;
            /** @type {import("./sandboxPadLinks.js").ButtonLinkTarget[]} */
            const buttonLinks = [];
            for (let t = 0; t < entry.targets.length; t++) {
                const manifestId = entry.targets[t];
                const linkedPropId = propIdByManifestId.get(manifestId);
                if (linkedPropId != null) buttonLinks.push({ type: "worldProp", id: linkedPropId });
                else buttonLinks.push({ type: "pad", id: `${groupId}:pad:${manifestId}` });
            }
            options.buttonLinks = buttonLinks;
        }
        const pad = buildSandboxPad(state, entry.preset, entry.x, entry.y, options);
        stampAssemblyEntityMember(state, pad, groupId, resolvedId, groupField);
        addPadToState(state, pad);
    }
}
