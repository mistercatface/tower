import { getPropAsset } from "../../../../Libraries/Content/PropCatalog.js";
import { registerInspectEntry, withInspectDefaults } from "../../../../Libraries/Inspect/InspectCatalog.js";
import { createLabeledCanInspect } from "../../../../Libraries/Inspect/factories/LabeledCanInspect.js";
import { createLabeledBoxInspect } from "../../../../Libraries/Inspect/factories/LabeledBoxInspect.js";
import { inspectManifest } from "../../config/inspectManifest.js";
import { buildFuelBarrelInspectMesh } from "./recipes/fuelBarrel/InspectMesh.js";
import { buildCrateInspectMesh } from "./recipes/crate/InspectMesh.js";

function resolveCrateFaceLabelSrc(subject, face) {
    const variants = getPropAsset("crate")?.visuals?.labelVariants ?? [];
    const idx = subject?.faceLabelVariants?.[face] ?? 0;
    return variants[idx % Math.max(1, variants.length)];
}

/** @type {Record<string, () => object>} */
const inspectEntryBuilders = {
    fuel_barrel: () => {
        const visuals = getPropAsset("barrel")?.visuals;
        return withInspectDefaults(createLabeledCanInspect(visuals, buildFuelBarrelInspectMesh));
    },
    wood_crate: () => {
        const visuals = getPropAsset("crate")?.visuals;
        return withInspectDefaults(createLabeledBoxInspect(visuals, buildCrateInspectMesh, resolveCrateFaceLabelSrc));
    },
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
