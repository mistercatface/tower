import { JACKO_CAN } from "../Config/props/JackoCan.js";
import { WOOD_CRATE, CRATE_LABEL_VARIANTS } from "../Config/props/Crate.js";
import { registerInspectEntry, withInspectDefaults } from "../Render/Inspect/InspectCatalog.js";
import { createLabeledCanInspect } from "../Render/Inspect/factories/LabeledCanInspect.js";
import { createLabeledBoxInspect } from "../Render/Inspect/factories/LabeledBoxInspect.js";
import { buildJackoInspectMesh } from "./inspect/recipes/jacko/InspectMesh.js";
import { buildCrateInspectMesh } from "./inspect/recipes/crate/InspectMesh.js";

function resolveCrateFaceLabelSrc(subject, face) {
    const idx = subject?.faceLabelVariants?.[face] ?? 0;
    return CRATE_LABEL_VARIANTS[idx % CRATE_LABEL_VARIANTS.length];
}

export function registerGameInspectEntries() {
    registerInspectEntry("jacko_can", {
        title: "VOLATILE FLUID",
        tapPadding: 14,
        ...withInspectDefaults(createLabeledCanInspect(JACKO_CAN, buildJackoInspectMesh)),
    });

    registerInspectEntry("wood_crate", {
        title: "SHIPPING CRATE",
        tapPadding: 14,
        ...withInspectDefaults(createLabeledBoxInspect(WOOD_CRATE, buildCrateInspectMesh, resolveCrateFaceLabelSrc)),
    });
}
