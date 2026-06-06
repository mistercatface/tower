import { JACKO_CAN } from "../../../../Config/content/props/JackoCan.js";
import { WOOD_CRATE, CRATE_LABEL_VARIANTS } from "../../../../Config/content/props/Crate.js";
import { registerInspectEntry, withInspectDefaults } from "../../../../Libraries/Inspect/InspectCatalog.js";
import { createLabeledCanInspect } from "../../../../Libraries/Inspect/factories/LabeledCanInspect.js";
import { createLabeledBoxInspect } from "../../../../Libraries/Inspect/factories/LabeledBoxInspect.js";
import { inspectManifest } from "../../config/inspectManifest.js";
import { buildJackoInspectMesh } from "./recipes/jacko/InspectMesh.js";
import { buildCrateInspectMesh } from "./recipes/crate/InspectMesh.js";

function resolveCrateFaceLabelSrc(subject, face) {
    const idx = subject?.faceLabelVariants?.[face] ?? 0;
    return CRATE_LABEL_VARIANTS[idx % CRATE_LABEL_VARIANTS.length];
}

/** @type {Record<string, () => object>} */
const inspectEntryBuilders = {
    jacko_can: () => withInspectDefaults(createLabeledCanInspect(JACKO_CAN, buildJackoInspectMesh)),
    wood_crate: () =>
        withInspectDefaults(createLabeledBoxInspect(WOOD_CRATE, buildCrateInspectMesh, resolveCrateFaceLabelSrc)),
};

export function registerGameInspectEntries() {
    for (const entry of inspectManifest) {
        const build = inspectEntryBuilders[entry.id];
        if (!build) continue;
        registerInspectEntry(entry.id, {
            title: entry.title,
            tapPadding: entry.tapPadding ?? 14,
            ...build(),
        });
    }
}
