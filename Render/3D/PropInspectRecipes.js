import { JACKO_CAN } from "../../Config/props/JackoCan.js";
import { WOOD_CRATE } from "../../Config/props/Crate.js";
import { createLabeledCanInspect } from "./inspect/LabeledCanInspect.js";
import { createLabeledBoxInspect } from "./inspect/LabeledBoxInspect.js";
import { buildJackoInspectMesh } from "./props/jacko/InspectMesh.js";
import { buildCrateInspectMesh } from "./props/crate/InspectMesh.js";
import { getCrateFaceLabelSrc } from "./props/crate/Label.js";

export const PROP_INSPECT_RECIPES = {
    jacko_can: createLabeledCanInspect(JACKO_CAN, buildJackoInspectMesh),
    wood_crate: createLabeledBoxInspect(WOOD_CRATE, buildCrateInspectMesh, getCrateFaceLabelSrc),
};

export function getPropInspectRecipe(inspectKey) {
    return PROP_INSPECT_RECIPES[inspectKey] ?? null;
}

export function preloadAllInspectAssets() {
    for (const recipe of Object.values(PROP_INSPECT_RECIPES)) {
        recipe.preload?.();
    }
}
