import { JACKO_CAN } from "../../Config/props/JackoCan.js";
import { createLabeledCanInspect } from "./inspect/LabeledCanInspect.js";
import { buildJackoInspectMesh } from "./props/jacko/InspectMesh.js";

export const PROP_INSPECT_RECIPES = {
    jacko_can: createLabeledCanInspect(JACKO_CAN, buildJackoInspectMesh),
};

export function getPropInspectRecipe(inspectKey) {
    return PROP_INSPECT_RECIPES[inspectKey] ?? null;
}

export function preloadAllInspectAssets() {
    for (const recipe of Object.values(PROP_INSPECT_RECIPES)) {
        recipe.preload?.();
    }
}
